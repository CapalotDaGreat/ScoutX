import { getFirestore, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { getFunctions } from 'firebase-admin/functions';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { createCallableOptions } from '../callableOptions';
import { taskQueueName } from '../region';
import { cvWorkerStatus, cvWorkerUrl, isApprovedWorkerOutput } from './cvConfig';
import { identityToken } from './cvWorker';
import { MATCH_COLLECTION, type MatchJobDoc } from './frameAnalysis';
import {
  ANSWERS, TRACKING_COLLECTION, applyAnswer, decodeReviewImage, emptyFeedback, parseTrackingReport, reviewImagePath,
  trackingV3Enabled, undoLast,
  validPeriods, workerFeedback, type Answer, type TrackingFeedback, type TrackingReport,
} from './trackingV3';
import { VIDEO_CONSENT_COLLECTION, VIDEO_CONSENT_VERSION } from './videoConsent';

type CurrentDoc = { report: TrackingReport | null; version: number; stale: boolean; feedbackRevision: number;
  pendingReason?: string | null; updatedAt?: string };
type FeedbackDoc = TrackingFeedback & { revision: number };

const OP_ID = /^[A-Za-z0-9_-]{8,64}$/;
const JOB_ID = /^[A-Za-z0-9_-]{1,80}$/;

async function ownedJob(tx: Transaction, db: Firestore, jobId: string, uid: string): Promise<MatchJobDoc> {
  const ref = db.collection(MATCH_COLLECTION).doc(jobId);
  const snap = await tx.get(ref);
  const consent = await tx.get(db.collection(VIDEO_CONSENT_COLLECTION).doc(jobId));
  if (!snap.exists) throw new HttpsError('not-found', 'Analysis not found.');
  const job = snap.data() as MatchJobDoc;
  if (job.playerId !== uid) throw new HttpsError('permission-denied', 'Only the owner can review this analysis.');
  if (!consent.exists || consent.get('uid') !== uid || consent.get('revokedAt') !== null
    || consent.get('policyVersion') !== VIDEO_CONSENT_VERSION) {
    throw new HttpsError('failed-precondition', 'Current video consent is required.');
  }
  return job;
}

/**
 * Stores the change, invalidates the current report (dependent statistics are stale immediately)
 * and schedules a re-resolve. Answers only affect this match; they are not training data.
 */
async function mutateFeedback(uid: string, jobId: string,
  change: (fb: TrackingFeedback, cur: CurrentDoc, job: MatchJobDoc) => TrackingFeedback): Promise<{ revision: number; pending: string | null }> {
  if (!JOB_ID.test(jobId)) throw new HttpsError('invalid-argument', 'Invalid analysis.');
  const db = getFirestore();
  const base = db.collection(MATCH_COLLECTION).doc(jobId).collection(TRACKING_COLLECTION);
  const result = await db.runTransaction(async (tx) => {
    const job = await ownedJob(tx, db, jobId, uid);
    const curSnap = await tx.get(base.doc('current'));
    const fbSnap = await tx.get(base.doc('feedback'));
    if (!curSnap.exists) throw new HttpsError('failed-precondition', 'No tracking report yet.');
    const cur = curSnap.data() as CurrentDoc;
    const fb = (fbSnap.exists ? fbSnap.data() : { ...emptyFeedback(), revision: 0 }) as FeedbackDoc;
    const next = change(fb, cur, job);
    const revision = (fb.revision ?? 0) + 1;
    const pending = trackingV3Enabled() && cvWorkerStatus() === 'available' ? null : 'worker_unavailable';
    tx.set(base.doc('feedback'), { ...next, revision, purpose: 'this_match_only' });
    tx.set(base.doc('current'), { stale: true, feedbackRevision: revision, pendingReason: pending,
      updatedAt: new Date().toISOString() }, { merge: true });
    return { revision, pending };
  });
  if (!result.pending) {
    await getFunctions().taskQueue(taskQueueName('resolveTrackingTask'))
      .enqueue({ jobId, feedbackRevision: result.revision }, { dispatchDeadlineSeconds: 900 });
  }
  return result;
}

export const answerTrackingQuestion = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const d = (request.data ?? {}) as { jobId?: unknown; questionId?: unknown; answer?: unknown; operationId?: unknown };
  if (typeof d.jobId !== 'string' || typeof d.questionId !== 'string' || d.questionId.length > 40
    || !ANSWERS.includes(d.answer as Answer) || typeof d.operationId !== 'string' || !OP_ID.test(d.operationId)) {
    throw new HttpsError('invalid-argument', 'Invalid answer.');
  }
  return mutateFeedback(uid, d.jobId, (fb, cur) => {
    if (!cur.report) throw new HttpsError('failed-precondition', 'No tracking report yet.');
    const next = applyAnswer(fb, cur.report, d.questionId as string, d.answer as Answer, d.operationId as string,
      new Date().toISOString());
    if (!next) throw new HttpsError('not-found', 'This question is no longer current.');
    return next;
  });
});

export const undoTrackingAnswer = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const jobId = (request.data as { jobId?: unknown } | undefined)?.jobId;
  if (typeof jobId !== 'string') throw new HttpsError('invalid-argument', 'Invalid analysis.');
  return mutateFeedback(uid, jobId, (fb) => undoLast(fb));
});

export const setTrackingPeriods = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const d = (request.data ?? {}) as { jobId?: unknown; periods?: unknown };
  const p = (d.periods ?? {}) as TrackingFeedback['periods'];
  if (typeof d.jobId !== 'string' || typeof p !== 'object') throw new HttpsError('invalid-argument', 'Invalid periods.');
  const clean: TrackingFeedback['periods'] = {};
  for (const k of ['kickoff', 'halftimeStart', 'secondHalfStart', 'fulltime'] as const) {
    if (p[k] !== undefined) clean[k] = Number(p[k]);
  }
  return mutateFeedback(uid, d.jobId, (fb, _cur, job) => {
    const duration = job.measuredDurationSec ?? job.durationSec ?? 0;
    if (!validPeriods(clean, duration)) throw new HttpsError('invalid-argument', 'Boundaries must be in order and inside the video.');
    return { ...fb, periods: clean };
  });
});

// ------------------------------------------------------------------------------ re-resolve task

export type TrackingWorkerClient = (body: Record<string, unknown>) => Promise<unknown | null>;

export function httpTrackingClient(baseUrl: string, env: NodeJS.ProcessEnv = process.env): TrackingWorkerClient {
  return async (body) => {
    const emulated = env.FUNCTIONS_EMULATOR === 'true';
    const token = emulated ? null : await identityToken(baseUrl);
    if (!emulated && !token) return null;
    try {
      const res = await fetch(`${baseUrl}/v3/tracking:resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };
}

export type ImageStore = (path: string, jpeg: Buffer) => Promise<void>;

export const storageImageStore: ImageStore = async (path, jpeg) => {
  await getStorage().bucket().file(path).save(jpeg, { contentType: 'image/jpeg', resumable: false,
    metadata: { cacheControl: 'private, max-age=3600' } });
};

/** Re-solves identity from cached stage-1 artifacts + feedback. Never re-runs detection. */
export async function processResolveTask(db: Firestore, jobId: string, feedbackRevision: number,
  client: TrackingWorkerClient | null, env: NodeJS.ProcessEnv = process.env,
  storeImage: ImageStore = storageImageStore): Promise<'done' | 'superseded' | 'unavailable' | 'rejected'> {
  if (!client || !trackingV3Enabled(env) || cvWorkerStatus(env) !== 'available') return 'unavailable';
  const base = db.collection(MATCH_COLLECTION).doc(jobId).collection(TRACKING_COLLECTION);
  const fbSnap = await base.doc('feedback').get();
  const fb = (fbSnap.exists ? fbSnap.data() : { ...emptyFeedback(), revision: 0 }) as FeedbackDoc;
  if ((fb.revision ?? 0) !== feedbackRevision) return 'superseded';
  const job = (await db.collection(MATCH_COLLECTION).doc(jobId).get()).data() as MatchJobDoc | undefined;
  if (!job || job.cancelRequested) return 'unavailable';
  const raw = await client({
    contractVersion: 3, jobId, privacy: { retainNonTargetIdentities: false, faceRecognition: false, persistMedia: false },
    target: job.targeting ?? {}, feedback: workerFeedback(fb),
  }) as { report?: unknown; timeline?: { times: number[]; states: string[] }; workerVersion?: string; models?: Record<string, string> } | null;
  if (!raw || !raw.workerVersion || !raw.models || !isApprovedWorkerOutput({ workerVersion: raw.workerVersion, models: raw.models }, env)) {
    return 'rejected';
  }
  const report = parseTrackingReport(raw.report, raw.timeline);
  if (!report) return 'rejected';
  // Review-card images: stored owner-only; a question without a valid image keeps imagePath null.
  const rawQuestions = (raw.report as { reviewQuestions?: Array<{ imageJpegBase64?: unknown }> }).reviewQuestions ?? [];
  for (let i = 0; i < report.reviewQuestions.length; i += 1) {
    const jpeg = decodeReviewImage(rawQuestions[i]?.imageJpegBase64);
    if (!jpeg) continue;
    const path = reviewImagePath(job.playerId, jobId, `${report.reviewQuestions[i].id}_r${feedbackRevision}`);
    await storeImage(path, jpeg);
    report.reviewQuestions[i].imagePath = path;
  }
  const ref = decodeReviewImage((raw.report as { referenceImageJpegBase64?: unknown }).referenceImageJpegBase64);
  if (ref) {
    const path = reviewImagePath(job.playerId, jobId, 'reference');
    await storeImage(path, ref);
    report.referenceImagePath = path;
  }
  return db.runTransaction(async (tx) => {
    const fresh = await tx.get(base.doc('feedback'));
    const cur = await tx.get(base.doc('current'));
    if (((fresh.data() as FeedbackDoc | undefined)?.revision ?? 0) !== feedbackRevision) return 'superseded';
    tx.set(base.doc('current'), { report, version: ((cur.data() as CurrentDoc | undefined)?.version ?? 0) + 1,
      stale: false, pendingReason: null, feedbackRevision, updatedAt: new Date().toISOString() });
    return 'done';
  });
}

export const resolveTrackingTask = onTaskDispatched(
  { retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 }, rateLimits: { maxConcurrentDispatches: 4 }, timeoutSeconds: 900 },
  async (request) => {
    const d = request.data as { jobId?: unknown; feedbackRevision?: unknown };
    if (typeof d.jobId !== 'string' || !JOB_ID.test(d.jobId) || !Number.isSafeInteger(d.feedbackRevision)) return;
    const url = cvWorkerUrl();
    await processResolveTask(getFirestore(), d.jobId, d.feedbackRevision as number, url ? httpTrackingClient(url) : null);
  },
);

import { randomUUID } from 'node:crypto';
import {
  getFirestore, type CollectionReference, type DocumentReference, type Firestore, type Transaction,
} from 'firebase-admin/firestore';
import { getFunctions } from 'firebase-admin/functions';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { createCallableOptions } from '../callableOptions';
import { taskQueueName } from '../region';
import { cvWorkerStatus, cvWorkerUrl, isApprovedWorkerOutput } from './cvConfig';
import { HELD_COLLECTION, pilotDecision } from './pilotGate';
import {
  IMAGE_ATTEMPT_MAX_MS, heldImagePath, publishImages, pruneJobImages, readImageDocs, referencedImagePaths, storageImageBucket,
  type ImageBucket,
} from './trackingImages';
import { identityToken } from './cvWorker';
import { MATCH_COLLECTION, type MatchJobDoc } from './frameAnalysis';
import {
  ANSWERS, TRACKING_COLLECTION, applyAnswer, decodeReviewImage, emptyFeedback, fromStoredForm, parseTrackingReport, reviewImagePath,
  toStoredForm,
  trackingV3Enabled, undoLast,
  validPeriods, workerFeedback, type Answer, type TrackingFeedback, type TrackingReport,
} from './trackingV3';
import { VIDEO_CONSENT_COLLECTION, VIDEO_CONSENT_VERSION } from './videoConsent';
import { writeSystemActivity, type SystemActivityInput } from '../notificationProducers';
import {
  notificationId, reviewNeeded, shouldReplaceReport, type PublishedReport, type ReportScope, type TrackingProgress,
} from './trackingProgress';
import {
  OCR_FOLLOW_UP_ACTION, OCR_FOLLOW_UP_DAILY_LIMIT, OCR_FOLLOW_UP_MAX_CROPS, followUpRunnable, followUpTaskId, planOcrFollowUp,
  type OcrFollowUp,
} from './trackingFollowUp';
import { rateLimitDocId } from '../security/rateLimit';
import {
  OCR_REFRESH_MAX_ATTEMPTS, RESOLVE_MAX_ATTEMPTS, TRACKING_ATTEMPT_LEASE_MS, TRACKING_TASK_TIMEOUT_SEC,
  TRACKING_WORKER_CLIENT_MS, TrackingWorkerTimeout, isWorkerTimeout, timeoutWillRetry,
} from './trackingDeadlines';

type CurrentDoc = { report: TrackingReport | null; version: number; stale: boolean; feedbackRevision: number;
  pendingReason?: string | null; updatedAt?: string; followUp?: OcrFollowUp | null };
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
    const cur = fromStoredForm(curSnap.data() as CurrentDoc);
    const fb = (fbSnap.exists ? fbSnap.data() : { ...emptyFeedback(), revision: 0 }) as FeedbackDoc;
    const next = change(fb, cur, job);
    const revision = (fb.revision ?? 0) + 1;
    // A contained (withheld) report stays withheld: an owner correction must not turn it into "updating".
    const pending = cur.pendingReason === 'withheld_for_review' ? 'withheld_for_review'
      : trackingV3Enabled() && cvWorkerStatus() === 'available' ? null : 'worker_unavailable';
    tx.set(base.doc('feedback'), { ...next, revision, purpose: 'this_match_only' });
    tx.set(base.doc('current'), { stale: true, feedbackRevision: revision, pendingReason: pending,
      updatedAt: new Date().toISOString() }, { merge: true });
    return { revision, pending };
  });
  if (!result.pending || result.pending === 'withheld_for_review') {
    await getFunctions().taskQueue(taskQueueName('resolveTrackingTask'))
      .enqueue({ jobId, feedbackRevision: result.revision }, { dispatchDeadlineSeconds: TRACKING_TASK_TIMEOUT_SEC });
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

/** A stored full report of this feedback revision produced under this run authorisation. */
function sameRun(d: Record<string, unknown> | undefined, feedbackRevision: number, runAuth: string): boolean {
  return Boolean(d && d.report && d.scope === 'full' && d.feedbackRevision === feedbackRevision && d.runAuthorizedAt === runAuth);
}

async function fullReportExists(base: CollectionReference, heldRef: DocumentReference, feedbackRevision: number, runAuth: string): Promise<boolean> {
  const [cur, held] = await Promise.all([base.doc('current').get(), heldRef.get()]);
  return sameRun(cur.data(), feedbackRevision, runAuth) || (!held.get('withheldAt') && sameRun(held.data(), feedbackRevision, runAuth));
}

/** R1: tracking run state on the job document (server-only field; drives the media lifecycle). */
export async function markTrackingFailed(db: Firestore, jobId: string, now = new Date()): Promise<void> {
  const ref = db.collection(MATCH_COLLECTION).doc(jobId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    // A finished run stays finished: a late failure of a duplicate task must not reopen the retry window.
    if (!snap.exists || snap.get('trackingState') === 'complete') return;
    tx.set(ref, { trackingState: 'failed', trackingFailedAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
  });
}

// ------------------------------------------------------------------------------ re-resolve task

export type TrackingWorkerClient = (body: Record<string, unknown>) => Promise<unknown | null>;

export function httpTrackingClient(baseUrl: string, env: NodeJS.ProcessEnv = process.env,
  route: 'resolve' | 'extract' | 'discover' | 'clipFrames' = 'resolve',
  timeoutMs = TRACKING_WORKER_CLIENT_MS): TrackingWorkerClient {
  return async (body) => {
    const emulated = env.FUNCTIONS_EMULATOR === 'true';
    const token = emulated ? null : await identityToken(baseUrl);
    if (!emulated && !token) return null;
    try {
      const res = await fetch(`${baseUrl}/v3/tracking:${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      return res.ok ? await res.json() : null;
    } catch (error) {
      // A deadline is retryable. Any other failure stays a null response, which resolve records
      // as rejected and does not retry (a 500 is not the same as a slow match).
      if (isWorkerTimeout(error)) throw new TrackingWorkerTimeout();
      return null;
    }
  };
}

/** Discovery and extraction already retry a null response. A client deadline is that same failure. */
export async function readWorker(client: TrackingWorkerClient, body: Record<string, unknown>): Promise<unknown | null> {
  try {
    return await client(body);
  } catch (error) {
    if (error instanceof TrackingWorkerTimeout) return null;
    throw error;
  }
}

export type ImageStore = (path: string, jpeg: Buffer) => Promise<void>;

/** Writes the server-only held twin of a review image (R2, trackingImages.ts); the owner path is filled on release. */
export const storageImageStore: ImageStore = async (path, jpeg) => {
  await getStorage().bucket().file(heldImagePath(path)).save(jpeg, { contentType: 'image/jpeg', resumable: false,
    metadata: { cacheControl: 'private, max-age=3600' } });
};

/** Image moves run against Storage only on the production path (tests inject their own store and bucket). */
export function imageBucketFor(storeImage: ImageStore, images?: ImageBucket | null): ImageBucket | null {
  return images !== undefined ? images : storeImage === storageImageStore ? storageImageBucket : null;
}

/** Writes a server activity (push policy, preferences and de-duplication apply downstream). */
export type TrackingNotifier = (activityId: string, input: SystemActivityInput) => Promise<boolean>;

/** Schedules one deferred-OCR follow-up round (5.2); the task id de-duplicates retries. */
export type FollowUpEnqueue = (payload: { jobId: string; feedbackRevision: number; round: number }, taskId: string) => Promise<void>;

export const cloudTasksFollowUpEnqueue: FollowUpEnqueue = async (payload, taskId) => {
  try {
    await getFunctions().taskQueue(taskQueueName('refreshTrackingOcrTask'))
      .enqueue(payload, { id: taskId, scheduleDelaySeconds: 5, dispatchDeadlineSeconds: TRACKING_TASK_TIMEOUT_SEC });
  } catch (e) {
    // ALREADY_EXISTS: this round was scheduled before (a retried publish) - nothing to do
    if (!String((e as { code?: unknown })?.code ?? e).includes('already-exists')) throw e;
  }
};

export type ResolveOptions = {
  /** 'feedback' = re-resolve after an identity answer; 'preliminary'/'full' = orchestrated;
   *  'refresh' = 5.2 deferred-OCR follow-up round `followUpRound`. */
  scope?: 'feedback' | 'preliminary' | 'full' | 'refresh';
  followUpRound?: number;
  enqueueFollowUp?: FollowUpEnqueue;
  notify?: TrackingNotifier;
  now?: () => Date;
  /** R2 image moves; defaults to Storage when the default image store is used. */
  images?: ImageBucket | null;
  /** Cloud Tasks retry count of this delivery (X-CloudTasks-TaskRetryCount); a higher attempt may take over a claim. */
  attempt?: number;
};

type ProgressDoc = TrackingProgress;

/**
 * Re-solves identity from cached stage-1 artifacts + feedback. Never re-runs detection.
 * Writes the report only when it covers at least as much of the recording as the current one
 * (a preliminary report never overwrites a fuller one), then records the publication in the
 * progress document and sends the de-duplicated "first moments" / "review needed" / "ready"
 * notifications.
 */
export async function processResolveTask(db: Firestore, jobId: string, feedbackRevision: number,
  client: TrackingWorkerClient | null, env: NodeJS.ProcessEnv = process.env,
  storeImage: ImageStore = storageImageStore, opts: ResolveOptions = {}): Promise<'done' | 'held' | 'stopped' | 'superseded' | 'unavailable' | 'rejected' | 'timedOut' | 'stale' | 'busy'> {
  if (!client || !trackingV3Enabled(env) || cvWorkerStatus(env) !== 'available') return 'unavailable';
  const now = opts.now ?? (() => new Date());
  const base = db.collection(MATCH_COLLECTION).doc(jobId).collection(TRACKING_COLLECTION);
  const fbSnap = await base.doc('feedback').get();
  const fb = (fbSnap.exists ? fbSnap.data() : { ...emptyFeedback(), revision: 0 }) as FeedbackDoc;
  if ((fb.revision ?? 0) !== feedbackRevision) return 'superseded';
  const job = (await db.collection(MATCH_COLLECTION).doc(jobId).get()).data() as MatchJobDoc | undefined;
  if (!job || job.cancelRequested) return 'unavailable';
  // Pilot gate (pilotGate.ts): checked before the worker call and again inside the publishing transaction, including
  // the run's authorisation epoch (work authorised before the current enable never runs).
  const runAuth = (await base.doc('progress').get()).get('pilotAuthorizedAt') as string | null | undefined;
  if ((await pilotDecision(db, job.playerId, env, undefined, { authorizedAt: runAuth })).decision !== 'allowed') return 'unavailable';
  const refresh = opts.scope === 'refresh';
  // Idempotency (2026-11-19 staging preparation): a repeated delivery of a resolve whose full report for this
  // feedback revision and run authorisation already exists (published or held) does nothing - no worker call,
  // no new version, notification or cleanup. A correction (new revision), an OCR refresh or an operator
  // re-authorisation (authorizeRun) still resolves.
  if (!refresh && runAuth && await fullReportExists(base, db.collection(MATCH_COLLECTION).doc(jobId).collection(HELD_COLLECTION).doc('current'),
    feedbackRevision, runAuth)) return 'stale';
  // Atomic claim before the worker call (2026-11-19): of simultaneous deliveries of the same resolve only one
  // calls the worker; the claim's token fences publication, so a claimant that was taken over cannot publish.
  const claimKey = `${feedbackRevision}|${refresh ? `refresh:${opts.followUpRound ?? -1}` : opts.scope ?? 'feedback'}|${runAuth ?? '-'}`;
  const claim = await claimResolve(db, base.doc('progress'), claimKey, opts.attempt ?? 0, now);
  // A duplicate while another delivery holds a live claim, or after it stored its report: ends without side
  // effects and without a queue retry.
  if (claim === 'busy') return 'busy';
  let outcome: Awaited<ReturnType<typeof resolveClaimed>> | null = null;
  try {
    outcome = await resolveClaimed(db, jobId, feedbackRevision, client, env, storeImage, opts, job, fb, refresh, now, base, claim);
    return outcome;
  } finally {
    // A stored report keeps its claim as a completion record (a later duplicate of the same key is 'busy');
    // anything else frees the key for the queue's retry.
    if (claim) await endResolveClaim(db, base.doc('progress'), claim, outcome === 'done' || outcome === 'held', now);
  }
}

/** Lease of a resolve claim: longer than the resolve task timeout. */
export const RESOLVE_LEASE_MS = TRACKING_ATTEMPT_LEASE_MS;

/**
 * Takes the resolve claim for `key` unless a live claim for the same key is held by this or a later attempt
 * ('busy'). Returns the token, or null when the job has no progress document (nothing to fence against).
 */
async function claimResolve(db: Firestore, progress: DocumentReference, key: string, attempt: number, now: () => Date): Promise<string | null | 'busy'> {
  return db.runTransaction(async (tx) => {
    const p = await tx.get(progress);
    if (!p.exists) return null;
    const c = p.get('resolveClaim') as { key?: string; attempt?: number; startedAt?: string; finishedAt?: string | null } | null | undefined;
    if (c && c.key === key && c.finishedAt) return 'busy' as const;
    if (c && c.key === key && (c.attempt ?? 0) >= attempt && c.startedAt && now().getTime() - Date.parse(c.startedAt) < RESOLVE_LEASE_MS) {
      return 'busy' as const;
    }
    const token = `${attempt}:${randomUUID()}`;
    tx.set(progress, { resolveClaim: { key, attempt, startedAt: now().toISOString(), token, finishedAt: null } }, { merge: true });
    return token;
  });
}

async function endResolveClaim(db: Firestore, progress: DocumentReference, token: string, finished: boolean, now: () => Date): Promise<void> {
  await db.runTransaction(async (tx) => {
    const p = await tx.get(progress);
    if ((p.get('resolveClaim') as { token?: string } | null | undefined)?.token !== token) return; // taken over: not ours
    tx.set(progress, { resolveClaim: finished ? { finishedAt: now().toISOString() } : null }, { merge: true });
  });
}

async function resolveClaimed(db: Firestore, jobId: string, feedbackRevision: number, client: TrackingWorkerClient,
  env: NodeJS.ProcessEnv, storeImage: ImageStore, opts: ResolveOptions, job: MatchJobDoc, fb: FeedbackDoc, refresh: boolean,
  now: () => Date, base: CollectionReference, claimToken: string | null): Promise<'done' | 'held' | 'stopped' | 'superseded' | 'unavailable' | 'rejected' | 'timedOut' | 'stale' | 'busy'> {
  let raw: { report?: unknown; timeline?: { times: number[]; states: string[] }; workerVersion?: string; models?: Record<string, string> } | null;
  try {
    raw = await client({
      contractVersion: 3, jobId, privacy: { retainNonTargetIdentities: false, faceRecognition: false, persistMedia: false },
      target: job.targeting ?? {}, feedback: workerFeedback(fb),
      ...(refresh ? { ocr: { mode: 'refresh', maxNewCrops: OCR_FOLLOW_UP_MAX_CROPS } } : {}),
    }) as typeof raw;
  } catch (error) {
    if (error instanceof TrackingWorkerTimeout) return 'timedOut';
    throw error;
  }
  if (!raw || !raw.workerVersion || !raw.models || !isApprovedWorkerOutput({ workerVersion: raw.workerVersion, models: raw.models }, env)) {
    return 'rejected';
  }
  const report = parseTrackingReport(raw.report, raw.timeline);
  if (!report) return 'rejected';
  const progressSnap = await base.doc('progress').get();
  const progress = progressSnap.exists ? progressSnap.data() as ProgressDoc : null;
  const totalParts = progress?.plan.length ?? 0;
  const scope: ReportScope = !progress || report.analysedRange.parts >= totalParts ? 'full' : 'preliminary';
  // Review-card images: stored owner-only; a question without a valid image keeps imagePath null.
  const rawReport = raw.report as { reviewQuestions?: Array<{ imageJpegBase64?: unknown }>;
    moments?: Array<{ id?: unknown; imageJpegBase64?: unknown }>; referenceImageJpegBase64?: unknown };
  const rawQuestions = rawReport.reviewQuestions ?? [];
  const staged: string[] = [];
  const attemptStartedMs = now().getTime();
  // Every attempt writes new object names, so a URL issued for an earlier image (signed URL or download token)
  // can never address a later one, even after withholding, reprocessing and release.
  // The random part keeps two attempts in the same millisecond (a takeover) from sharing names, so a fenced
  // claimant discarding its own images can never delete the current claimant's.
  const attempt = `${attemptStartedMs.toString(36)}${randomUUID().replace(/-/g, '').slice(0, 6)}`;
  for (let i = 0; i < report.reviewQuestions.length; i += 1) {
    const jpeg = decodeReviewImage(rawQuestions[i]?.imageJpegBase64);
    if (!jpeg) continue;
    const path = reviewImagePath(job.playerId, jobId, `${report.reviewQuestions[i].id}_r${feedbackRevision}_${attempt}`);
    await storeImage(path, jpeg);
    staged.push(path);
    report.reviewQuestions[i].imagePath = path;
  }
  // Moment thumbnails: the target's own close-up crop inside the clip, owner-only.
  const momentImages = new Map<string, unknown>((rawReport.moments ?? []).map((m) => [String(m?.id), m?.imageJpegBase64]));
  for (const m of report.moments) {
    const jpeg = decodeReviewImage(momentImages.get(m.id));
    if (!jpeg) continue;
    const path = reviewImagePath(job.playerId, jobId, `${m.id}_p${report.analysedRange.parts}_r${feedbackRevision}_${attempt}`);
    await storeImage(path, jpeg);
    staged.push(path);
    m.imagePath = path;
  }
  const ref = decodeReviewImage(rawReport.referenceImageJpegBase64);
  if (ref) {
    const path = reviewImagePath(job.playerId, jobId, `reference_${attempt}`);
    await storeImage(path, ref);
    staged.push(path);
    report.referenceImagePath = path;
  }
  const at = now().toISOString();
  let followUp: OcrFollowUp | null = null;
  const heldRef = db.collection(MATCH_COLLECTION).doc(jobId).collection(HELD_COLLECTION).doc('current');
  const outcome = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(base.doc('feedback'));
    const cur = await tx.get(base.doc('current'));
    // A result that comes back after the pilot was stopped (kill switch) or the owner was removed is discarded here.
    const progTx = await tx.get(base.doc('progress'));
    const gate = await pilotDecision(db, job.playerId, env, tx, { authorizedAt: progTx.get('pilotAuthorizedAt') as string | null | undefined });
    if (gate.decision !== 'allowed') return 'stopped' as const;
    // Fenced: a claimant that was taken over (expired lease, later attempt, newer revision) publishes nothing.
    if (claimToken && (progTx.get('resolveClaim') as { token?: string } | null | undefined)?.token !== claimToken) return 'stale' as const;
    const held = gate.hold ? await tx.get(heldRef) : null;
    if (((fresh.data() as FeedbackDoc | undefined)?.revision ?? 0) !== feedbackRevision) return 'superseded' as const;
    const curDoc = cur.data() as (CurrentDoc & { scope?: ReportScope; parts?: number }) | undefined;
    if (refresh && !followUpRunnable(curDoc?.followUp, feedbackRevision, opts.followUpRound ?? -1)) return 'stale' as const;
    // While held, only a report still awaiting review counts as "previous"; a withheld (contained) or released
    // copy must not block verified reprocessing.
    const pendingHeld = held?.exists && held.get('report') && !held.get('withheldAt') ? held.data() : undefined;
    const prevDoc = (held ? pendingHeld : curDoc) as (CurrentDoc & { scope?: ReportScope; parts?: number }) | undefined;
    if (!shouldReplaceReport(prevDoc?.report ? { parts: prevDoc.parts ?? 0, scope: prevDoc.scope } : null,
      { parts: report.analysedRange.parts, scope })) {
      return 'stale' as const;
    }
    // 5.2 deferred OCR: decide the follow-up from facts; per-user daily quota in the same transaction
    const quotaRef = db.collection('callableRateLimits').doc(rateLimitDocId(job.playerId, OCR_FOLLOW_UP_ACTION, 'day', now()));
    const quota = await tx.get(quotaRef);
    const used = (quota.get('count') as number | undefined) ?? 0;
    followUp = planOcrFollowUp(opts.scope ?? 'feedback', feedbackRevision, report.ocrDeferred, curDoc?.followUp ?? null, at,
      refresh ? opts.followUpRound ?? null : null, used < OCR_FOLLOW_UP_DAILY_LIMIT);
    const scheduledNow = followUp?.status === 'scheduled'
      && !(curDoc?.followUp?.revision === followUp.revision && curDoc?.followUp?.round === followUp.round);
    if (scheduledNow) {
      tx.set(quotaRef, { uid: job.playerId, action: OCR_FOLLOW_UP_ACTION, window: 'day', bucket: at.slice(0, 10), count: used + 1,
        updatedAt: at }, { merge: true });
    }
    // Same rule inside the transaction: of concurrent duplicate deliveries only the first one stores a report.
    const runAuthTx = progTx.get('pilotAuthorizedAt') as string | null | undefined;
    if (!refresh && runAuthTx && (sameRun(cur.data(), feedbackRevision, runAuthTx)
      || sameRun(gate.hold && held?.exists && !held.get('withheldAt') ? held.data() : undefined, feedbackRevision, runAuthTx))) {
      return 'stale' as const;
    }
    const doc = { report: toStoredForm(report), version: (prevDoc?.version ?? 0) + 1, scope, parts: report.analysedRange.parts,
      stale: false, pendingReason: null, feedbackRevision, updatedAt: at, followUp, runAuthorizedAt: runAuthTx ?? null,
      // Provenance for audits and rollback: exactly which approved worker build and models produced this report.
      producedBy: { workerVersion: raw.workerVersion, models: raw.models } };
    // R1: a full report (published or held) finishes the tracking run; the media lifecycle takes it from here.
    if (progress && scope === 'full') {
      tx.set(db.collection(MATCH_COLLECTION).doc(jobId), { trackingState: 'complete', trackingCompletedAt: at, updatedAt: at }, { merge: true });
    }
    if (held) {
      // Held for review: nothing reaches tracking/current (owner-readable) and no completion notice is sent.
      // Reprocessing a contained report keeps the containment record for audit.
      const contained = held?.exists && held.get('withheldAt')
        ? { previousWithheld: { withheldAt: held.get('withheldAt'), withheldReason: held.get('withheldReason') ?? null } } : {};
      tx.set(heldRef, { ...doc, ...contained, heldAt: at });
      if (progress) tx.set(base.doc('progress'), { resolving: null, held: { scope, at }, updatedAt: at }, { merge: true });
      return 'held' as const;
    }
    tx.set(base.doc('current'), doc);
    if (progress) {
      const published: PublishedReport = { scope, parts: report.analysedRange.parts, analysedEndSec: report.analysedRange.endSec,
        moments: report.moments.length, reviewQuestions: report.reviewQuestions.length, at };
      tx.set(base.doc('progress'), { [scope]: published, resolving: null, updatedAt: at }, { merge: true });
    }
    return 'done' as const;
  });
  // R2: images follow the report. Published -> owner paths; held -> stay server-only; anything else discards
  // this attempt's images (and superseded images older than any attempt that could still be running).
  const images = imageBucketFor(storeImage, opts.images);
  if (images) {
    if (outcome === 'done') await publishImages(images, referencedImagePaths(toStoredForm(report)));
    if (outcome === 'done' || outcome === 'held' || staged.length) {
      await pruneJobImages(images, job.playerId, jobId, await readImageDocs(db, MATCH_COLLECTION, jobId),
        { own: outcome === 'done' || outcome === 'held' ? [] : staged, olderThanMs: attemptStartedMs - IMAGE_ATTEMPT_MAX_MS });
    }
  }
  const fu = followUp as OcrFollowUp | null;
  if ((outcome === 'done' || outcome === 'held') && fu && fu.status === 'scheduled') {
    await (opts.enqueueFollowUp ?? cloudTasksFollowUpEnqueue)({ jobId, feedbackRevision, round: fu.round },
      followUpTaskId(jobId, feedbackRevision, fu.round));
  }
  if (outcome !== 'done' || !progress || refresh) return outcome;
  const notify = opts.notify ?? ((id, input) => writeSystemActivity(db, id, input));
  const ref_ = { entityType: 'match_analysis', entityId: jobId, label: 'Match analysis' };
  const gen = progress.generation;
  if (report.moments.some((m) => !m.candidate)) {
    await notify(notificationId('first_moments', jobId, gen), { recipientId: job.playerId, recipientRole: 'player',
      type: 'analysis_first_moments', category: 'analysis', title: 'Your first moments are ready',
      body: scope === 'full' ? 'Your match moments are ready to watch.' : 'Watch your first moments while the rest of the match is analysed.',
      reference: ref_ });
  }
  if (reviewNeeded(report)) {
    await notify(notificationId('review_needed', jobId, gen), { recipientId: job.playerId, recipientRole: 'player',
      type: 'analysis_review_needed', category: 'analysis', title: 'Is this you?',
      body: 'A few quick answers help PitchProof follow the right player.', reference: ref_ });
  }
  if (scope === 'full' && opts.scope !== 'feedback') {
    await notify(notificationId('ready', jobId, gen), { recipientId: job.playerId, recipientRole: 'player',
      type: 'analysis_completed', category: 'analysis', title: 'Your match review is ready',
      body: 'Your full match review is ready. Open it to see your moments and next steps.', reference: ref_ });
  }
  return outcome;
}

export const resolveTrackingTask = onTaskDispatched(
  { retryConfig: { maxAttempts: RESOLVE_MAX_ATTEMPTS, minBackoffSeconds: 30 }, rateLimits: { maxConcurrentDispatches: 4 },
    timeoutSeconds: TRACKING_TASK_TIMEOUT_SEC },
  async (request) => {
    const d = request.data as { jobId?: unknown; feedbackRevision?: unknown; scope?: unknown };
    if (typeof d.jobId !== 'string' || !JOB_ID.test(d.jobId) || !Number.isSafeInteger(d.feedbackRevision)) return;
    const scope = d.scope === 'preliminary' || d.scope === 'full' ? d.scope : 'feedback';
    const url = cvWorkerUrl();
    const db = getFirestore();
    let fbRevision = d.feedbackRevision as number;
    if (scope !== 'feedback') {
      // Orchestrated resolves always use the latest answers.
      const fb = await db.collection(MATCH_COLLECTION).doc(d.jobId).collection(TRACKING_COLLECTION).doc('feedback').get();
      fbRevision = (fb.data() as FeedbackDoc | undefined)?.revision ?? 0;
    }
    const attempt = request.retryCount ?? 0;
    const outcome = await processResolveTask(db, d.jobId, fbRevision, url ? httpTrackingClient(url) : null, process.env,
      storageImageStore, { scope, attempt });
    // Earlier attempts throw, so Cloud Tasks retries. The last attempt falls through and, for a full
    // resolve, settleOrchestratedResolve marks the job interrupted. Returning here would count as success.
    if (outcome === 'timedOut' && timeoutWillRetry(attempt, RESOLVE_MAX_ATTEMPTS)) throw new TrackingWorkerTimeout();
    if (scope !== 'feedback') await settleOrchestratedResolve(db, d.jobId, scope, outcome);
  },
);

/**
 * 5.2 deferred-OCR follow-up round: runs only if it is still the current round of the current
 * feedback revision (duplicates and stale tasks do nothing), publishes a newer report version
 * through the normal guarded path and records the outcome. Never loops: the next round is only
 * scheduled by processResolveTask when this one made progress (trackingFollowUp.ts).
 */
export async function processOcrFollowUpTask(db: Firestore, jobId: string, feedbackRevision: number, round: number,
  client: TrackingWorkerClient | null, env: NodeJS.ProcessEnv = process.env, storeImage: ImageStore = storageImageStore,
  opts: Omit<ResolveOptions, 'scope' | 'followUpRound'> = {}): Promise<Awaited<ReturnType<typeof processResolveTask>>> {
  const now = opts.now ?? (() => new Date());
  const ref = db.collection(MATCH_COLLECTION).doc(jobId).collection(TRACKING_COLLECTION).doc('current');
  const claimed = await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const f = (cur.data() as CurrentDoc | undefined)?.followUp ?? null;
    if (!followUpRunnable(f, feedbackRevision, round)) return false;
    tx.set(ref, { followUp: { ...(f as OcrFollowUp), status: 'running', updatedAt: now().toISOString() } }, { merge: true });
    return true;
  });
  if (!claimed) return 'stale';
  const outcome = await processResolveTask(db, jobId, feedbackRevision, client, env, storeImage,
    { ...opts, scope: 'refresh', followUpRound: round });
  if (outcome === 'timedOut' && timeoutWillRetry(opts.attempt ?? 0, OCR_REFRESH_MAX_ATTEMPTS)) {
    throw new TrackingWorkerTimeout();
  }
  if (outcome !== 'done') {
    const job = (await db.collection(MATCH_COLLECTION).doc(jobId).get()).data() as MatchJobDoc | undefined;
    const status = outcome === 'superseded' || outcome === 'stale' || outcome === 'busy' ? 'stale' : job?.cancelRequested ? 'cancelled' : 'failed';
    await db.runTransaction(async (tx) => {
      const cur = await tx.get(ref);
      const f = (cur.data() as CurrentDoc | undefined)?.followUp ?? null;
      if (f && f.revision === feedbackRevision && f.round === round && ['scheduled', 'running'].includes(f.status)) {
        tx.set(ref, { followUp: { ...f, status, updatedAt: now().toISOString() } }, { merge: true });
      }
    });
  }
  return outcome;
}

export const refreshTrackingOcrTask = onTaskDispatched(
  { retryConfig: { maxAttempts: OCR_REFRESH_MAX_ATTEMPTS, minBackoffSeconds: 60 }, rateLimits: { maxConcurrentDispatches: 2 },
    timeoutSeconds: TRACKING_TASK_TIMEOUT_SEC },
  async (request) => {
    const d = request.data as { jobId?: unknown; feedbackRevision?: unknown; round?: unknown };
    if (typeof d.jobId !== 'string' || !JOB_ID.test(d.jobId) || !Number.isSafeInteger(d.feedbackRevision)
      || !Number.isSafeInteger(d.round) || (d.round as number) < 1) return;
    const url = cvWorkerUrl();
    await processOcrFollowUpTask(getFirestore(), d.jobId, d.feedbackRevision as number, d.round as number,
      url ? httpTrackingClient(url) : null, process.env, storageImageStore, { attempt: request.retryCount ?? 0 });
  },
);

/**
 * Releases the "resolving" slot after an orchestrated resolve that did not publish, so later
 * segments can schedule another one. A full report that cannot be built interrupts the analysis
 * (the owner can resume; cached segments are kept).
 */
export async function settleOrchestratedResolve(db: Firestore, jobId: string, scope: ReportScope,
  outcome: Awaited<ReturnType<typeof processResolveTask>>, now = new Date()): Promise<void> {
  // 'busy': another delivery holds the claim and settles the run itself.
  if (outcome === 'done' || outcome === 'held' || outcome === 'busy') return;
  const ref = db.collection(MATCH_COLLECTION).doc(jobId).collection(TRACKING_COLLECTION).doc('progress');
  const failed = scope === 'full' && (outcome === 'rejected' || outcome === 'unavailable' || outcome === 'stopped' || outcome === 'timedOut');
  await ref.set({ resolving: null, updatedAt: now.toISOString(), ...(failed ? { outcome: 'interrupted' } : {}) }, { merge: true });
  // R1: an interrupted run is resumable; the source stays for the failed-analysis retry window, then goes.
  if (failed) await markTrackingFailed(db, jobId, now);
}

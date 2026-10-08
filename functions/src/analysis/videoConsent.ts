import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { createCallableOptions } from '../callableOptions';
import { isFootageProcessingApproved } from '../ai/providerConfig';
import { discardUploadsForJob } from '../uploads/sessions';
import { cvWorkerStatus } from './cvConfig';
import {
  MODE_LIMITS,
  isClipContext,
  parseIntent,
  processingModeFor,
  selectAnalysisMode,
  type AnalysisMode,
  type ProcessingMode,
} from './mode';

export const VIDEO_CONSENT_COLLECTION = 'videoProcessingConsents';
/** Bump when the consent sheet text changes; older records then need a fresh consent. */
export const VIDEO_CONSENT_VERSION = '2026-10-video-v1';

export const VIDEO_CONSENT_ACKNOWLEDGEMENTS = ['processing', 'rights', 'retention', 'provider'] as const;
export type VideoConsentAcknowledgement = (typeof VIDEO_CONSENT_ACKNOWLEDGEMENTS)[number];

export type VideoProcessingConsent = {
  uid: string;
  jobId: string;
  purpose: 'match_analysis';
  analysisMode: AnalysisMode;
  processingMode: ProcessingMode;
  providers: string[];
  policyVersion: string;
  retainSource: boolean;
  keepForRetry: boolean;
  evidenceClips: boolean;
  consentedAt: string;
  revokedAt: string | null;
};

export type ConsentRequest = {
  jobId: string;
  acknowledgements: Record<VideoConsentAcknowledgement, true>;
  retainSource: boolean;
  keepForRetry: boolean;
  evidenceClips: boolean;
};

const JOB_ID = /^[A-Za-z0-9_-]{6,80}$/;

export function parseConsentRequest(data: unknown): ConsentRequest | null {
  if (!data || typeof data !== 'object') return null;
  const input = data as Record<string, unknown>;
  if (typeof input.jobId !== 'string' || !JOB_ID.test(input.jobId)) return null;
  const acks = input.acknowledgements as Record<string, unknown> | undefined;
  if (!acks || !VIDEO_CONSENT_ACKNOWLEDGEMENTS.every((key) => acks[key] === true)) return null;
  return {
    jobId: input.jobId,
    acknowledgements: { processing: true, rights: true, retention: true, provider: true },
    retainSource: input.retainSource === true,
    keepForRetry: input.keepForRetry === true,
    evidenceClips: input.evidenceClips === true,
  };
}

/** Providers the footage (or frames of it) can reach for this job; recorded in the consent. */
export function providersFor(processingMode: ProcessingMode, cvAvailable: boolean): string[] {
  const providers = ['openrouter_zdr'];
  if (processingMode === 'cloud_video') providers.unshift('pitchproof_cloud');
  if (processingMode === 'cloud_video' && cvAvailable) providers.push('pitchproof_cv_worker');
  return providers;
}

/** Throws unless a current, unrevoked consent exists for this job and processing mode. */
export async function assertVideoConsent(
  db: Firestore,
  uid: string,
  jobId: string,
  processingMode?: ProcessingMode,
): Promise<VideoProcessingConsent> {
  const snap = await db.collection(VIDEO_CONSENT_COLLECTION).doc(jobId).get();
  const consent = snap.data() as VideoProcessingConsent | undefined;
  const valid =
    consent
    && consent.uid === uid
    && consent.revokedAt === null
    && consent.policyVersion === VIDEO_CONSENT_VERSION
    && (!processingMode || consent.processingMode === processingMode);
  if (!valid) {
    throw new HttpsError('failed-precondition', 'Confirm how your video is processed before analysis starts.', {
      reason: 'video_consent_required',
    });
  }
  return consent;
}

/**
 * Records explicit consent for one job. Picking a video is not consent: the app calls this only
 * after the player ticked every acknowledgement on the consent sheet.
 */
export const recordVideoProcessingConsent = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const parsed = parseConsentRequest(request.data);
  if (!parsed) {
    throw new HttpsError('invalid-argument', 'Every acknowledgement must be confirmed.', { reason: 'video_consent_incomplete' });
  }
  if (!isFootageProcessingApproved()) {
    throw new HttpsError('failed-precondition', 'Video analysis is not available yet.', {
      reason: 'ai_privacy_configuration_required',
    });
  }
  const db = getFirestore();
  const jobRef = db.collection('matchAnalysisJobs').doc(parsed.jobId);
  const job = await jobRef.get();
  if (!job.exists || job.get('playerId') !== uid) throw new HttpsError('not-found', 'Match analysis job not found.');
  if (job.get('status') !== 'uploading') {
    throw new HttpsError('failed-precondition', 'Consent can only be given before processing starts.');
  }
  const durationSec = Number(job.get('durationSec'));
  const analysisMode = selectAnalysisMode(durationSec, parseIntent(job.get('analysisIntent')));
  if (!analysisMode) {
    throw new HttpsError('invalid-argument', `Videos can be up to ${MODE_LIMITS.maxDurationSec / 60} minutes long.`, {
      reason: 'duration',
    });
  }
  const processingMode = processingModeFor(analysisMode, durationSec);
  const now = new Date().toISOString();
  const consent: VideoProcessingConsent = {
    uid,
    jobId: parsed.jobId,
    purpose: 'match_analysis',
    analysisMode,
    processingMode,
    providers: providersFor(processingMode, cvWorkerStatus() === 'available'),
    policyVersion: VIDEO_CONSENT_VERSION,
    // Device-frame jobs never upload the video, so there is nothing to keep or cut.
    retainSource: processingMode === 'cloud_video' && parsed.retainSource,
    keepForRetry: processingMode === 'cloud_video' && parsed.keepForRetry,
    evidenceClips: processingMode === 'cloud_video' && parsed.evidenceClips,
    consentedAt: now,
    revokedAt: null,
  };
  const clipContext = job.get('clipContext');
  await db.collection(VIDEO_CONSENT_COLLECTION).doc(parsed.jobId).set(consent);
  await jobRef.update({
    analysisMode,
    processingMode,
    retainSource: consent.retainSource,
    keepForRetry: consent.keepForRetry,
    evidenceClipsRequested: consent.evidenceClips,
    clipContext: isClipContext(clipContext) ? clipContext : 'auto',
    consentVersion: VIDEO_CONSENT_VERSION,
    consentedAt: now,
    updatedAt: now,
  });
  return { jobId: parsed.jobId, analysisMode, processingMode, providers: consent.providers };
});

/** Withdraws consent for a job: processing stops and temporary media is removed. */
export const revokeVideoProcessingConsent = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const jobId = (request.data as { jobId?: unknown } | null)?.jobId;
  if (typeof jobId !== 'string' || !JOB_ID.test(jobId)) throw new HttpsError('invalid-argument', 'jobId is required.');
  const db = getFirestore();
  const ref = db.collection(VIDEO_CONSENT_COLLECTION).doc(jobId);
  const snap = await ref.get();
  if (!snap.exists || snap.get('uid') !== uid) throw new HttpsError('not-found', 'Consent not found.');
  const now = new Date().toISOString();
  await ref.update({ revokedAt: now });
  const jobRef = db.collection('matchAnalysisJobs').doc(jobId);
  const job = await jobRef.get();
  if (job.exists && !['complete', 'cancelled', 'expired'].includes(String(job.get('status')))) {
    await jobRef.update({
      cancelRequested: true,
      status: 'cancelled',
      pipelineState: 'cancelled',
      mediaCleanupState: 'pending',
      mediaCleanupDueAt: now,
      cancelledAt: now,
      updatedAt: now,
    });
    await discardUploadsForJob(db, uid, jobId);
  }
  return { jobId, revokedAt: now };
});

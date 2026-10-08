import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { createCallableOptions, resolveCallableCors } from '../callableOptions';
import { isFootageProcessingApproved } from '../ai/providerConfig';
import { assertVideoConsent } from '../analysis/videoConsent';
import { hasCurrentConsent } from '../legal/consent';
import { loadSafetyPolicy } from '../safety/userSafety';
import { consumeQuota, planFor, releaseQuota } from '../entitlements/quotaService';
import {
  ACTIVE_UPLOAD_STATES,
  REUSABLE_UPLOAD_STATES,
  UPLOAD_LIMITS,
  dayKey,
  isAbandoned,
  isCrc32cBase64,
  parseUploadRequest,
  quarantinePath,
  type UploadRequestError,
  type UploadState,
} from './model';
import { logSafeError } from '../logging/redact';

const REQUEST_ERRORS: Record<UploadRequestError, string> = {
  purpose: 'Unsupported upload type.',
  job: 'This upload is not linked to a valid analysis.',
  content_type: 'Only MP4 and MOV videos can be uploaded.',
  too_small: 'This file is too small to be a video.',
  too_large: 'Videos can be up to 4 GB.',
  duration: 'Videos can be up to 150 minutes long.',
  fingerprint: 'The file could not be identified. Please pick it again.',
};

type UploadDoc = {
  ownerId: string;
  state: UploadState;
  jobId: string;
  storagePath: string;
  createdAt: string;
};

/** Browsers get CORS on the session only from allowed origins; the iOS app sends none. */
function sessionOrigin(request: CallableRequest<unknown>): string | undefined {
  const origin = request.rawRequest?.headers?.origin;
  if (typeof origin !== 'string') return undefined;
  const allowed = resolveCallableCors();
  return allowed === true || (Array.isArray(allowed) && allowed.includes(origin)) ? origin : undefined;
}

async function assertMayUpload(uid: string, db: Firestore): Promise<void> {
  const policy = await loadSafetyPolicy(uid, db);
  if (!policy.youthFunctionalityActive) {
    throw new HttpsError('failed-precondition', 'Uploads are available once your account setup is complete.', {
      reason: 'not_allowed',
    });
  }
  if (!(await hasCurrentConsent(uid, 'media_upload', db))) {
    throw new HttpsError('failed-precondition', 'Please acknowledge the Video and Recording Policy before uploading.', {
      reason: 'consent_required',
    });
  }
}

async function sessionUriFor(db: Firestore, uploadId: string): Promise<string | null> {
  const uri = (await db.collection('mediaUploadSessions').doc(uploadId).get()).get('sessionUri');
  return typeof uri === 'string' ? uri : null;
}

/**
 * Opens a GCS resumable session bound to the quarantine path, content type and exact length.
 * The client streams 8 MiB chunks from disk into it. Re-picking the same file resumes the
 * existing upload instead of starting over.
 */
export const createUploadSession = onCall(createCallableOptions({ timeoutSeconds: 60 }), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to upload.');
  const parsed = parseUploadRequest((request.data ?? {}) as Record<string, unknown>);
  if (!parsed.ok) {
    throw new HttpsError('invalid-argument', REQUEST_ERRORS[parsed.error], { reason: parsed.error });
  }
  const input = parsed.value;
  const db = getFirestore();
  await assertMayUpload(uid, db);

  const job = await db.collection('matchAnalysisJobs').doc(input.jobId).get();
  if (!job.exists || job.get('playerId') !== uid) {
    throw new HttpsError('failed-precondition', REQUEST_ERRORS.job);
  }

  if (!isFootageProcessingApproved()) {
    throw new HttpsError('failed-precondition', 'Video analysis is not available yet.', {
      reason: 'ai_privacy_configuration_required',
    });
  }
  await assertVideoConsent(db, uid, input.jobId, 'cloud_video');

  const plan = await planFor(db, uid);
  if (input.sizeBytes > plan.maxVideoBytes || input.declaredDurationSec > plan.maxVideoDurationSec) {
    throw new HttpsError('failed-precondition', 'This video is longer or larger than your plan allows.', {
      reason: 'plan_limit',
      plan: plan.id,
      maxVideoBytes: plan.maxVideoBytes,
      maxVideoDurationSec: plan.maxVideoDurationSec,
    });
  }
  // Charged before the upload so nobody uploads gigabytes only to hit a limit; refunded if the
  // video is rejected or the job is cancelled before analysis starts.
  await consumeQuota(db, uid, 'full_match_analysis', input.jobId);

  const duplicates = await db
    .collection('mediaUploads')
    .where('ownerId', '==', uid)
    .where('fingerprint', '==', input.fingerprint)
    .limit(10)
    .get();
  const reusable = duplicates.docs.find(
    (doc) =>
      doc.get('sizeBytes') === input.sizeBytes
      && doc.get('jobId') === input.jobId
      && REUSABLE_UPLOAD_STATES.includes(doc.get('state') as UploadState),
  );
  if (reusable) {
    const state = reusable.get('state') as UploadState;
    const sessionUri = state === 'uploading' ? await sessionUriFor(db, reusable.id) : null;
    if (state !== 'uploading' || sessionUri) {
      return { uploadId: reusable.id, sessionUri, state, chunkBytes: UPLOAD_LIMITS.chunkBytes, reused: true };
    }
  }

  const active = await db
    .collection('mediaUploads')
    .where('ownerId', '==', uid)
    .where('state', 'in', [...ACTIVE_UPLOAD_STATES])
    .limit(UPLOAD_LIMITS.maxActivePerUser + 1)
    .get();
  if (active.docs.filter((doc) => doc.get('jobId') !== input.jobId).length >= UPLOAD_LIMITS.maxActivePerUser) {
    throw new HttpsError('resource-exhausted', 'Finish or cancel your current uploads before starting another.', {
      reason: 'limit_reached',
    });
  }

  const now = new Date();
  const limitRef = db.collection('uploadSessionLimits').doc(`${uid}_${dayKey(now)}`);
  await db.runTransaction(async (transaction) => {
    const count = ((await transaction.get(limitRef)).get('count') as number | undefined) ?? 0;
    if (count >= UPLOAD_LIMITS.maxSessionsPerDay) {
      throw new HttpsError('resource-exhausted', 'You have started the maximum number of uploads for today.', {
        reason: 'limit_reached',
      });
    }
    transaction.set(limitRef, { ownerId: uid, count: count + 1, updatedAt: now.toISOString() }, { merge: true });
  });

  const uploadRef = db.collection('mediaUploads').doc();
  const storagePath = quarantinePath(uid, uploadRef.id);
  const [sessionUri] = await getStorage()
    .bucket()
    .file(storagePath)
    .createResumableUpload({
      metadata: {
        contentType: input.contentType,
        contentLength: input.sizeBytes,
        metadata: { ownerId: uid, uploadId: uploadRef.id },
      },
      origin: sessionOrigin(request),
    });

  const createdAt = now.toISOString();
  await uploadRef.set({
    id: uploadRef.id,
    ownerId: uid,
    purpose: input.purpose,
    jobId: input.jobId,
    fileName: input.fileName,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    declaredDurationSec: input.declaredDurationSec,
    fingerprint: input.fingerprint,
    integrityMode: input.integrity,
    state: 'uploading',
    storagePath,
    createdAt,
    updatedAt: createdAt,
  });
  await db.collection('mediaUploadSessions').doc(uploadRef.id).set({ ownerId: uid, sessionUri, createdAt });

  return { uploadId: uploadRef.id, sessionUri, state: 'uploading', chunkBytes: UPLOAD_LIMITS.chunkBytes, reused: false };
});

async function discardUpload(db: Firestore, uploadId: string, data: UploadDoc, state: 'cancelled' | 'expired'): Promise<void> {
  const sessionUri = await sessionUriFor(db, uploadId);
  if (sessionUri) {
    // Cancels the GCS session so no further bytes are accepted (GCS answers 499).
    await fetch(sessionUri, { method: 'DELETE' }).catch(() => undefined);
  }
  await getStorage().bucket().file(data.storagePath).delete({ ignoreNotFound: true });
  await db.collection('mediaUploadSessions').doc(uploadId).delete();
  const now = new Date().toISOString();
  await db.collection('mediaUploads').doc(uploadId).update({ state, updatedAt: now });
  if (state === 'expired') {
    await releaseQuota(db, data.ownerId, 'full_match_analysis', data.jobId).catch(() => false);
    const jobRef = db.collection('matchAnalysisJobs').doc(data.jobId);
    const job = await jobRef.get();
    if (job.exists && job.get('playerId') === data.ownerId && job.get('status') === 'uploading') {
      await jobRef.update({ status: 'expired', pipelineState: 'expired', updatedAt: now });
    }
  }
}

/** Stops every unfinished upload attached to a job (used when the job is cancelled). */
export async function discardUploadsForJob(db: Firestore, uid: string, jobId: string): Promise<number> {
  const snapshot = await db.collection('mediaUploads').where('ownerId', '==', uid).where('jobId', '==', jobId).get();
  let discarded = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data() as UploadDoc;
    if (!ACTIVE_UPLOAD_STATES.includes(data.state)) continue;
    await discardUpload(db, doc.id, data, 'cancelled');
    discarded += 1;
  }
  return discarded;
}

/**
 * Records the CRC32C the client computed from the file on its disk, just before it sends the
 * final chunk. Quarantine compares it with the CRC32C Cloud Storage computed for the stored
 * object; only equality counts as verified.
 */
export const declareUploadChecksum = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const body = (request.data ?? {}) as { uploadId?: unknown; crc32c?: unknown };
  const uploadId = typeof body.uploadId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.uploadId) ? body.uploadId : '';
  if (!isCrc32cBase64(body.crc32c)) throw new HttpsError('invalid-argument', 'Invalid checksum.');
  const db = getFirestore();
  const ref = uploadId ? db.collection('mediaUploads').doc(uploadId) : null;
  const snap = ref ? await ref.get() : null;
  if (!ref || !snap?.exists || snap.get('ownerId') !== uid) throw new HttpsError('not-found', 'Upload not found.');
  if (snap.get('state') !== 'uploading') {
    throw new HttpsError('failed-precondition', 'This upload is no longer open.', { reason: 'session_closed' });
  }
  await ref.update({ declaredCrc32c: body.crc32c, checksumDeclaredAt: new Date().toISOString() });
  return { uploadId, declared: true };
});

export const cancelUploadSession = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uploadId = typeof (request.data as { uploadId?: unknown })?.uploadId === 'string'
    ? (request.data as { uploadId: string }).uploadId
    : '';
  const db = getFirestore();
  const snap = uploadId ? await db.collection('mediaUploads').doc(uploadId).get() : null;
  const data = snap?.data() as UploadDoc | undefined;
  if (!data || data.ownerId !== uid) throw new HttpsError('not-found', 'Upload not found.');
  if (!ACTIVE_UPLOAD_STATES.includes(data.state)) return { uploadId, state: data.state };
  await discardUpload(db, uploadId, data, 'cancelled');
  return { uploadId, state: 'cancelled' };
});

/** Expires uploads that never reached ready within the retention window and deletes their bytes. */
export async function expireAbandonedUploads(db: Firestore, now: Date = new Date()): Promise<number> {
  const snapshot = await db.collection('mediaUploads').where('state', 'in', [...ACTIVE_UPLOAD_STATES]).limit(200).get();
  let expired = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data() as UploadDoc;
    if (!isAbandoned(data.createdAt, now)) continue;
    try {
      await discardUpload(db, doc.id, data, 'expired');
      expired += 1;
    } catch (error) {
      logger.warn('Upload cleanup failed', { uploadId: doc.id, ...logSafeError(error) });
    }
  }
  return expired;
}

export const cleanupAbandonedUploads = onSchedule('every 24 hours', async () => {
  const expired = await expireAbandonedUploads(getFirestore());
  logger.info('Abandoned uploads expired', { expired });
});

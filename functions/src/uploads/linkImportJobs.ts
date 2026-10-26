import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getFunctions } from 'firebase-admin/functions';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { createCallableOptions } from '../callableOptions';
import { isFootageProcessingApproved } from '../ai/providerConfig';
import { assertVideoConsent, VIDEO_CONSENT_COLLECTION } from '../analysis/videoConsent';
import { inspectSource, type SourceInspection } from '../analysis/videoProviders';
import { consumeQuota, planFor, releaseQuota } from '../entitlements/quotaService';
import { taskQueueName } from '../region';
import { assertCallableRateLimit, LINK_IMPORT_START_LIMIT } from '../security/rateLimit';
import { assertMayUpload, reserveUploadSlot } from './sessions';
import { UPLOAD_LIMITS, quarantinePath, type UploadState } from './model';
import {
  downloadToQuarantine,
  importContentType,
  IMPORT_SOURCES_COLLECTION,
  linkFingerprint,
  type HopOpener,
  type ImportFailure,
  type ImportSink,
} from './linkImport';
import type { Resolver } from '../analysis/videoProviders';

const JOB_ID = /^[A-Za-z0-9_-]{6,80}$/;
const UPLOAD_ID = /^[A-Za-z0-9_-]{1,64}$/;

type LinkUploadDoc = {
  ownerId: string;
  jobId: string;
  state: UploadState;
  source?: string;
  sizeBytes: number;
  contentType: string;
  storagePath: string;
};

export type StartLinkImportResult = { uploadId: string; state: UploadState; bytes: number; host: string; reused: boolean };

/** The parts of inspection the app may see (never the media URL). */
function publicInspection(inspection: SourceInspection) {
  const { mediaUrl: _hidden, ...safe } = inspection;
  return safe;
}

/**
 * "Import from link" step 2: starts a server-side import of a direct HTTPS video link into
 * quarantine for an existing, consented job. Same gates as a device upload: account setup,
 * media-upload consent, job ownership, video-processing consent (cloud), plan limits, quota
 * (charged per job, refunded on rejection), active/daily upload limits.
 */
export const startLinkImport = onCall(createCallableOptions({ timeoutSeconds: 60 }), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to import a video.');
  const body = (request.data ?? {}) as { jobId?: unknown; url?: unknown };
  if (typeof body.jobId !== 'string' || !JOB_ID.test(body.jobId)) {
    throw new HttpsError('invalid-argument', 'This import is not linked to a valid analysis.', { reason: 'job' });
  }
  if (typeof body.url !== 'string' || body.url.length > 2048) {
    throw new HttpsError('invalid-argument', 'Provide a video link.', { reason: 'invalid' });
  }
  const jobId = body.jobId;
  await assertCallableRateLimit(uid, LINK_IMPORT_START_LIMIT);
  const db = getFirestore();
  await assertMayUpload(uid, db);
  const job = await db.collection('matchAnalysisJobs').doc(jobId).get();
  if (!job.exists || job.get('playerId') !== uid) {
    throw new HttpsError('failed-precondition', 'This import is not linked to a valid analysis.', { reason: 'job' });
  }
  if (job.get('cancelRequested') === true || ['cancelled', 'complete', 'expired'].includes(String(job.get('status')))) {
    throw new HttpsError('failed-precondition', 'This analysis is no longer open.', { reason: 'job_closed' });
  }
  if (!isFootageProcessingApproved()) {
    throw new HttpsError('failed-precondition', 'Video analysis is not available yet.', {
      reason: 'ai_privacy_configuration_required',
    });
  }
  await assertVideoConsent(db, uid, jobId, 'cloud_video');

  const plan = await planFor(db, uid);
  const maxBytes = Math.min(plan.maxVideoBytes, UPLOAD_LIMITS.maxBytes);
  const inspection = await inspectSource(body.url, { maxBytes });
  if (inspection.status !== 'ready' || !inspection.mediaUrl) {
    throw new HttpsError('failed-precondition', 'This link cannot be imported.', {
      reason: inspection.reason,
      inspection: publicInspection(inspection),
    });
  }
  const bytes = Number(inspection.metadata.bytes);
  if (!Number.isInteger(bytes) || bytes < UPLOAD_LIMITS.minBytes) {
    throw new HttpsError('failed-precondition', 'This file is too small to be a video.', { reason: 'too_small' });
  }
  const host = String(inspection.metadata.host ?? '');
  const fingerprint = linkFingerprint(uid, jobId, inspection.mediaUrl);

  const existing = await db.collection('mediaUploads').where('ownerId', '==', uid).where('fingerprint', '==', fingerprint)
    .limit(5).get();
  const open = existing.docs.find((doc) => ['uploading', 'quarantined', 'validated', 'ready'].includes(String(doc.get('state'))));
  if (open) {
    return { uploadId: open.id, state: open.get('state') as UploadState, bytes, host, reused: true } satisfies StartLinkImportResult;
  }

  await consumeQuota(db, uid, 'full_match_analysis', jobId);
  const now = new Date();
  await reserveUploadSlot(db, uid, jobId, now);

  const uploadRef = db.collection('mediaUploads').doc();
  const createdAt = now.toISOString();
  await uploadRef.set({
    id: uploadRef.id,
    ownerId: uid,
    purpose: 'match_footage',
    source: 'link',
    sourceHost: host,
    jobId,
    fileName: 'linked-video',
    contentType: importContentType(String(inspection.metadata.contentType ?? '')),
    sizeBytes: bytes,
    declaredDurationSec: Number(job.get('durationSec')) || null,
    fingerprint,
    integrityMode: 'crc32c',
    state: 'uploading',
    receivedBytes: 0,
    storagePath: quarantinePath(uid, uploadRef.id),
    createdAt,
    updatedAt: createdAt,
  });
  // Server-only: the link may carry an access token. Deleted when the import ends.
  await db.collection(IMPORT_SOURCES_COLLECTION).doc(uploadRef.id).set({ ownerId: uid, url: inspection.mediaUrl, createdAt });
  await getFunctions().taskQueue(taskQueueName('processLinkImport')).enqueue(
    { uploadId: uploadRef.id },
    { dispatchDeadlineSeconds: 1800 },
  );
  logger.info('Link import queued', { uploadId: uploadRef.id, host });
  return { uploadId: uploadRef.id, state: 'uploading', bytes, host, reused: false } satisfies StartLinkImportResult;
});

export type LinkImportDeps = {
  sinkFor?: (upload: LinkUploadDoc, uploadId: string, db: Firestore) => ImportSink;
  open?: HopOpener;
  resolve?: Resolver;
  now?: () => number;
};

/** GCS resumable write into the quarantine path; the checksum is declared before finalising. */
function gcsSink(upload: LinkUploadDoc, uploadId: string, db: Firestore): ImportSink {
  const file = getStorage().bucket().file(upload.storagePath);
  const stream = file.createWriteStream({
    resumable: true,
    metadata: { contentType: upload.contentType, metadata: { ownerId: upload.ownerId, uploadId, source: 'link' } },
  });
  return {
    async write(chunk) {
      if (!stream.write(chunk)) await once(stream, 'drain');
    },
    async beforeEnd(crc32c, bytes) {
      await db.collection('mediaUploads').doc(uploadId).update({
        declaredCrc32c: crc32c,
        checksumDeclaredAt: new Date().toISOString(),
        receivedBytes: bytes,
      });
    },
    async end() {
      stream.end();
      await finished(stream);
    },
    async abort() {
      stream.destroy();
      await file.delete({ ignoreNotFound: true }).catch(() => undefined);
    },
  };
}

async function importCancelled(db: Firestore, uploadId: string, upload: LinkUploadDoc): Promise<boolean> {
  const [current, job, consent] = await Promise.all([
    db.collection('mediaUploads').doc(uploadId).get(),
    db.collection('matchAnalysisJobs').doc(upload.jobId).get(),
    db.collection(VIDEO_CONSENT_COLLECTION).doc(upload.jobId).get(),
  ]);
  return current.get('state') !== 'uploading'
    || job.get('cancelRequested') === true
    || job.get('status') === 'cancelled'
    || !consent.exists
    || consent.get('uid') !== upload.ownerId
    || consent.get('revokedAt') != null;
}

async function failImport(db: Firestore, uploadId: string, upload: LinkUploadDoc, reason: ImportFailure): Promise<void> {
  const now = new Date().toISOString();
  const ref = db.collection('mediaUploads').doc(uploadId);
  if (reason === 'cancelled') {
    // The cancel path owns the state; make sure nothing is left behind.
    if ((await ref.get()).get('state') === 'uploading') {
      await ref.update({ state: 'cancelled', rejectionReason: 'link_cancelled', updatedAt: now });
      await releaseQuota(db, upload.ownerId, 'full_match_analysis', upload.jobId).catch(() => false);
    }
    return;
  }
  await ref.update({ state: 'rejected', rejectionReason: `link_${reason}`, rejectedAt: now, updatedAt: now });
  await releaseQuota(db, upload.ownerId, 'full_match_analysis', upload.jobId).catch(() => false);
  const jobRef = db.collection('matchAnalysisJobs').doc(upload.jobId);
  const job = await jobRef.get();
  if (job.exists && job.get('playerId') === upload.ownerId && job.get('videoUploadId') == null) {
    await jobRef.update({ status: 'failed', pipelineState: 'failed', errorCode: 'link_import_failed', error: null, updatedAt: now });
  }
}

/**
 * Task body. Returns what happened; the quarantine trigger takes over after a successful write.
 * Idempotent: only an upload still in `uploading` with its server-only source is imported.
 */
export async function processLinkImport(
  db: Firestore,
  uploadId: string,
  deps: LinkImportDeps = {},
): Promise<'imported' | 'failed' | 'skipped'> {
  const ref = db.collection('mediaUploads').doc(uploadId);
  const upload = (await ref.get()).data() as LinkUploadDoc | undefined;
  if (!upload || upload.source !== 'link' || upload.state !== 'uploading') return 'skipped';
  const sourceRef = db.collection(IMPORT_SOURCES_COLLECTION).doc(uploadId);
  const source = await sourceRef.get();
  const url = source.get('url');
  if (!source.exists || source.get('ownerId') !== upload.ownerId || typeof url !== 'string') {
    await failImport(db, uploadId, upload, 'invalid_url');
    return 'failed';
  }
  const plan = await planFor(db, upload.ownerId);
  let lastProgressWrite = 0;
  const outcome = await downloadToQuarantine({
    url,
    expectedBytes: upload.sizeBytes,
    maxBytes: Math.min(plan.maxVideoBytes, UPLOAD_LIMITS.maxBytes),
    sink: (deps.sinkFor ?? gcsSink)(upload, uploadId, db),
    open: deps.open,
    resolve: deps.resolve,
    now: deps.now,
    isCancelled: () => importCancelled(db, uploadId, upload),
    onProgress: async (bytes) => {
      const t = Date.now();
      if (t - lastProgressWrite < 5_000) return;
      lastProgressWrite = t;
      await ref.update({ receivedBytes: bytes, updatedAt: new Date(t).toISOString() });
    },
  });
  await sourceRef.delete().catch(() => undefined);
  if (!outcome.ok) {
    await failImport(db, uploadId, upload, outcome.reason);
    logger.info('Link import failed', { uploadId, reason: outcome.reason });
    return 'failed';
  }
  logger.info('Link import written to quarantine', { uploadId, bytes: outcome.bytes, host: outcome.finalHost });
  return 'imported';
}

export const processLinkImportTask = onTaskDispatched(
  { retryConfig: { maxAttempts: 1 }, rateLimits: { maxConcurrentDispatches: 4 }, timeoutSeconds: 1800, memory: '1GiB' },
  async (request) => {
    const uploadId = (request.data as { uploadId?: unknown } | undefined)?.uploadId;
    if (typeof uploadId !== 'string' || !UPLOAD_ID.test(uploadId)) return;
    await processLinkImport(getFirestore(), uploadId);
  },
);

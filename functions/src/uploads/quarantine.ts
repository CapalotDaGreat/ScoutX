import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffprobeStatic from 'ffprobe-static';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { startMatchPipeline } from '../analysis/pipeline';
import { parseIntent, selectAnalysisMode } from '../analysis/mode';
import { planFor, releaseQuota } from '../entitlements/quotaService';
import { readableSourceFor, type MediaSource } from './mediaSource';
import { getMediaScanner } from './mediaScanner';
import { VIDEO_CONSENT_COLLECTION } from '../analysis/videoConsent';
import { footageMediaId, integrityVerdict, matchFootagePath, parseQuarantinePath, type UploadState } from './model';
import {
  evaluateProbe,
  hasVideoMagicBytes,
  parseProbeJson,
  type ProbeSummary,
  type RejectionReason,
} from './probe';

type UploadDoc = {
  ownerId: string;
  state: UploadState;
  jobId: string;
  sizeBytes: number;
  storagePath: string;
  integrityMode?: string;
  declaredCrc32c?: string;
};

const PROBE_TIMEOUT_MS = 180_000;

/** Runs ffprobe with an argument array (no shell) and network-only protocols. */
async function runFfprobe(source: MediaSource, cwd: string): Promise<string | null> {
  const binary = ffprobeStatic.path;
  const args = [
    '-v', 'error',
    '-protocol_whitelist', 'http,https,tcp,tls',
    '-rw_timeout', '30000000',
    ...(source.headers ? ['-headers', source.headers] : []),
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    source.url,
  ];
  return new Promise((resolve) => {
    execFile(binary, args, { cwd, timeout: PROBE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      resolve(error ? null : stdout);
    });
  });
}

async function readHead(path: string): Promise<Uint8Array> {
  const [buffer] = await getStorage().bucket().file(path).download({ start: 0, end: 15 });
  return new Uint8Array(buffer);
}

async function reject(db: Firestore, uploadId: string, data: UploadDoc, reason: RejectionReason): Promise<UploadState> {
  await getStorage().bucket().file(data.storagePath).delete({ ignoreNotFound: true });
  const now = new Date().toISOString();
  await db.collection('mediaUploads').doc(uploadId).update({ state: 'rejected', rejectionReason: reason, rejectedAt: now, updatedAt: now });
  await releaseQuota(db, data.ownerId, 'full_match_analysis', data.jobId).catch(() => false);
  const jobRef = db.collection('matchAnalysisJobs').doc(data.jobId);
  const job = await jobRef.get();
  if (job.exists && job.get('playerId') === data.ownerId && job.get('videoUploadId') == null) {
    await jobRef.update({
      status: 'failed',
      pipelineState: 'failed',
      errorCode: 'video_rejected',
      error: null,
      updatedAt: now,
    });
  }
  logger.info('Upload rejected', { uploadId, reason });
  return 'rejected';
}

/** Kept footage becomes a private library item so highlights and reels can reference it. */
async function fileFootageInLibrary(
  db: Firestore,
  data: UploadDoc,
  storagePath: string,
  durationSec: number,
  now: string,
): Promise<void> {
  const ref = db.collection('players').doc(data.ownerId).collection('media').doc(footageMediaId(data.jobId));
  if ((await ref.get()).exists) return;
  await ref.set({
    id: ref.id,
    ownerId: data.ownerId,
    type: 'matchFootage',
    storagePath,
    thumbnailPath: null,
    durationSec,
    sourceMatchId: null,
    sourceJobId: data.jobId,
    visibility: 'private',
    rightsState: 'unconfirmed',
    moderationState: 'none',
    uploadState: 'ready',
    processingState: 'none',
    favorite: false,
    tags: [],
    goalIds: [],
    title: 'Match footage',
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Consent can be withdrawn while validation runs. Checked before and after the copy so a
 * withdrawn job never gets promoted footage or a pipeline start.
 */
async function processingWithdrawn(db: Firestore, uploadId: string, data: UploadDoc): Promise<boolean> {
  const [consent, job, upload] = await Promise.all([
    db.collection(VIDEO_CONSENT_COLLECTION).doc(data.jobId).get(),
    db.collection('matchAnalysisJobs').doc(data.jobId).get(),
    db.collection('mediaUploads').doc(uploadId).get(),
  ]);
  return !consent.exists
    || consent.get('uid') !== data.ownerId
    || consent.get('revokedAt') != null
    || job.get('cancelRequested') === true
    || job.get('status') === 'cancelled'
    || upload.get('state') === 'cancelled';
}

async function discardWithdrawn(db: Firestore, uploadId: string, data: UploadDoc, extraPath?: string): Promise<UploadState> {
  const bucket = getStorage().bucket();
  await bucket.file(data.storagePath).delete({ ignoreNotFound: true });
  if (extraPath) await bucket.file(extraPath).delete({ ignoreNotFound: true });
  const now = new Date().toISOString();
  await db.collection('mediaUploads').doc(uploadId).update({ state: 'cancelled', rejectionReason: 'consent_withdrawn', updatedAt: now });
  await releaseQuota(db, data.ownerId, 'full_match_analysis', data.jobId).catch(() => false);
  logger.info('Upload discarded after consent withdrawal', { uploadId });
  return 'cancelled';
}

async function promote(db: Firestore, uploadId: string, data: UploadDoc, summary: ProbeSummary): Promise<UploadState> {
  const jobRef = db.collection('matchAnalysisJobs').doc(data.jobId);
  const job = await jobRef.get();
  if (!job.exists || job.get('playerId') !== data.ownerId) return reject(db, uploadId, data, 'job_missing');
  if (await processingWithdrawn(db, uploadId, data)) return discardWithdrawn(db, uploadId, data);

  const bucket = getStorage().bucket();
  const destination = matchFootagePath(data.ownerId, data.jobId);
  await bucket.file(data.storagePath).copy(bucket.file(destination), {
    contentType: summary.container === 'mov' ? 'video/quicktime' : 'video/mp4',
    metadata: { ownerId: data.ownerId, uploadId },
  });
  await bucket.file(data.storagePath).delete({ ignoreNotFound: true });
  if (await processingWithdrawn(db, uploadId, data)) return discardWithdrawn(db, uploadId, data, destination);

  const now = new Date().toISOString();
  const measuredMode = selectAnalysisMode(summary.durationSec, parseIntent(job.get('analysisIntent')));
  await jobRef.update({
    videoStoragePath: destination,
    videoUploadId: uploadId,
    videoProbe: summary,
    fileSizeBytes: summary.sizeBytes,
    measuredDurationSec: summary.durationSec,
    ...(measuredMode ? { analysisMode: measuredMode } : {}),
    videoValidatedAt: now,
    updatedAt: now,
    ...(job.get('cancelRequested') === true ? {} : { pipelineState: 'validating' }),
  });
  await db.collection('mediaUploads').doc(uploadId).update({
    state: 'ready',
    promotedPath: destination,
    readyAt: now,
    updatedAt: now,
  });
  // Footage only becomes a library item when the player chose "Keep match video"; otherwise
  // the source is temporary and the media lifecycle deletes it after analysis.
  if (job.get('retainSource') === true) await fileFootageInLibrary(db, data, destination, summary.durationSec, now);
  await startMatchPipeline(db, data.jobId);
  return 'ready';
}

/**
 * QUARANTINED → VALIDATED | REJECTED → READY. Only objects that pass magic-byte, ffprobe and
 * limit checks leave quarantine; everything else is deleted. Safe to re-run after a crash.
 */
export async function processQuarantinedObject(db: Firestore, path: string, sizeBytes: number): Promise<UploadState | null> {
  const parsed = parseQuarantinePath(path);
  if (!parsed) return null;
  const ref = db.collection('mediaUploads').doc(parsed.uploadId);
  const data = (await ref.get()).data() as UploadDoc | undefined;
  if (!data || data.ownerId !== parsed.uid || !['uploading', 'quarantined', 'validated'].includes(data.state)) {
    await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
    logger.warn('Quarantine object without an open upload was deleted', { uploadId: parsed.uploadId });
    return null;
  }

  const now = new Date().toISOString();
  if (data.state === 'uploading') {
    await db.collection('mediaUploadSessions').doc(parsed.uploadId).delete();
    await ref.update({ state: 'quarantined', receivedBytes: sizeBytes, quarantinedAt: now, updatedAt: now });
  }
  if (sizeBytes !== data.sizeBytes) return reject(db, parsed.uploadId, data, 'size_mismatch');
  const [objectMetadata] = await getStorage().bucket().file(path).getMetadata();
  const integrity = integrityVerdict(data.integrityMode, data.declaredCrc32c, objectMetadata.crc32c);
  if (integrity === 'mismatch') return reject(db, parsed.uploadId, data, 'integrity_mismatch');
  if (integrity === 'missing_declaration' || integrity === 'no_server_hash') {
    return reject(db, parsed.uploadId, data, 'integrity_missing');
  }
  await ref.update({ integrity });
  if (!hasVideoMagicBytes(await readHead(path))) return reject(db, parsed.uploadId, data, 'not_video');

  const workDir = await mkdtemp(join(tmpdir(), 'scoutx-probe-'));
  let output: string | null;
  try {
    output = await runFfprobe(await readableSourceFor(path), workDir);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
  const evaluation = evaluateProbe(output ? parseProbeJson(output) : null, data.sizeBytes);
  if (!evaluation.ok) return reject(db, parsed.uploadId, data, evaluation.reason);
  const plan = await planFor(db, data.ownerId);
  if (evaluation.summary.durationSec > plan.maxVideoDurationSec) return reject(db, parsed.uploadId, data, 'too_long');

  const scan = await getMediaScanner().scan(path);
  if (scan.status === 'flagged') return reject(db, parsed.uploadId, data, 'scanner_flagged');

  await ref.update({ state: 'validated', probe: evaluation.summary, scan, validatedAt: new Date().toISOString() });
  return promote(db, parsed.uploadId, data, evaluation.summary);
}

export const onQuarantineObjectFinalized = onObjectFinalized(
  { memory: '4GiB', timeoutSeconds: 540, concurrency: 1, cpu: 2, retry: false },
  async (event) => {
    const path = event.data.name;
    if (!path?.startsWith('quarantine/')) return;
    const db = getFirestore();
    try {
      await processQuarantinedObject(db, path, Number(event.data.size ?? 0));
    } catch (error) {
      const parsed = parseQuarantinePath(path);
      logger.error('Upload validation failed', {
        uploadId: parsed?.uploadId ?? null,
        errorName: error instanceof Error ? error.name : 'unknown',
      });
      const data = parsed ? ((await db.collection('mediaUploads').doc(parsed.uploadId).get()).data() as UploadDoc | undefined) : undefined;
      if (parsed && data && data.state !== 'ready' && data.state !== 'rejected') {
        await reject(db, parsed.uploadId, data, 'probe_failed');
      }
    }
  },
);

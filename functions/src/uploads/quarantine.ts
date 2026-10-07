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
import { readableSourceFor, type MediaSource } from './mediaSource';
import { getMediaScanner } from './mediaScanner';
import { matchFootagePath, parseQuarantinePath, type UploadState } from './model';
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

async function promote(db: Firestore, uploadId: string, data: UploadDoc, summary: ProbeSummary): Promise<UploadState> {
  const jobRef = db.collection('matchAnalysisJobs').doc(data.jobId);
  const job = await jobRef.get();
  if (!job.exists || job.get('playerId') !== data.ownerId) return reject(db, uploadId, data, 'job_missing');

  const bucket = getStorage().bucket();
  const destination = matchFootagePath(data.ownerId, data.jobId);
  await bucket.file(data.storagePath).copy(bucket.file(destination), {
    contentType: summary.container === 'mov' ? 'video/quicktime' : 'video/mp4',
    metadata: { ownerId: data.ownerId, uploadId },
  });
  await bucket.file(data.storagePath).delete({ ignoreNotFound: true });

  const now = new Date().toISOString();
  await jobRef.update({
    videoStoragePath: destination,
    videoUploadId: uploadId,
    videoProbe: summary,
    fileSizeBytes: summary.sizeBytes,
    measuredDurationSec: summary.durationSec,
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
      logger.error('Upload validation failed', { path, message: error instanceof Error ? error.message : 'unknown' });
      const parsed = parseQuarantinePath(path);
      const data = parsed ? ((await db.collection('mediaUploads').doc(parsed.uploadId).get()).data() as UploadDoc | undefined) : undefined;
      if (parsed && data && data.state !== 'ready' && data.state !== 'rejected') {
        await reject(db, parsed.uploadId, data, 'probe_failed');
      }
    }
  },
);

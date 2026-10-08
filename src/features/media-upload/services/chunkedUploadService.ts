import { PendingUploadStore } from '@/features/media-upload/repositories/PendingUploadStore';
import { UploadSessionRepository } from '@/features/media-upload/repositories/UploadSessionRepository';
import { UploadFileChangedError, type PendingUpload, type UploadRequest } from '@/features/media-upload/types';
import { CHUNKED_UPLOAD } from './chunkPlan';
import { openChunkSource } from './chunkSource';
import { computeUploadFingerprint } from './fingerprint';
import { releaseUploadCopy } from './uploadCopies';
import { isPastResumeWindow } from './uploadRecovery';
import {
  ResumableSessionUploader,
  UploadSessionExpiredError,
  type ChunkSource,
  type SessionUploadOutcome,
  type UploadProgress,
} from './resumableSessionUploader';

export type ChunkedUploadControl = { pause(): void; cancel(): void };

export type ChunkedUploadCallbacks = {
  onPreparing?: () => void;
  onProgress?: (progress: UploadProgress) => void;
  onControl?: (control: ChunkedUploadControl) => void;
};

export type ChunkedUploadResult = { uploadId: string; outcome: SessionUploadOutcome };

export class UploadValidationError extends Error {
  readonly reason: 'too_large' | 'too_small' | 'duration';

  constructor(reason: 'too_large' | 'too_small' | 'duration') {
    super(`Upload rejected before start: ${reason}`);
    this.name = 'UploadValidationError';
    this.reason = reason;
  }
}

function assertUploadable(source: ChunkSource, request: UploadRequest): void {
  if (source.size < CHUNKED_UPLOAD.minBytes) throw new UploadValidationError('too_small');
  if (source.size > CHUNKED_UPLOAD.maxBytes) throw new UploadValidationError('too_large');
  if (request.declaredDurationSec > CHUNKED_UPLOAD.maxDurationSec) throw new UploadValidationError('duration');
}

type ResolvedSession =
  | { kind: 'transfer'; upload: PendingUpload; fresh: boolean }
  | { kind: 'complete'; uploadId: string };

const SERVER_FINISHED_STATES = new Set(['quarantined', 'validated', 'ready']);

async function forget(uid: string, upload: PendingUpload): Promise<void> {
  await PendingUploadStore.remove(uid, upload.uploadId);
  await UploadSessionRepository.cancel(upload.uploadId).catch(() => undefined);
  await releaseUploadCopy(upload.fileUri);
}

/**
 * Before continuing a stored session: the server must still hold it open (not cancelled after a
 * consent withdrawal, expired or rejected) and the file must be the same bytes that were started.
 */
async function revalidatePending(uid: string, pending: PendingUpload, source: ChunkSource): Promise<ResolvedSession> {
  if (isPastResumeWindow(pending.createdAt)) {
    await forget(uid, pending);
    throw new UploadSessionExpiredError();
  }
  const server = await UploadSessionRepository.fetch(pending.uploadId);
  if (server && server !== 'missing' && SERVER_FINISHED_STATES.has(server.state)) {
    await PendingUploadStore.remove(uid, pending.uploadId);
    return { kind: 'complete', uploadId: pending.uploadId };
  }
  if (server === 'missing' || (server && server.state !== 'uploading')) {
    await PendingUploadStore.remove(uid, pending.uploadId);
    throw new UploadSessionExpiredError();
  }
  const fingerprint = await computeUploadFingerprint(source);
  if (pending.fingerprint && pending.fingerprint !== fingerprint) {
    await forget(uid, pending);
    throw new UploadFileChangedError();
  }
  const upload = pending.fingerprint ? pending : { ...pending, fingerprint };
  return { kind: 'transfer', upload, fresh: false };
}

async function resolveSession(uid: string, request: UploadRequest, source: ChunkSource): Promise<ResolvedSession> {
  const pending = await PendingUploadStore.findForJob(uid, request.jobId);
  if (pending && pending.fileUri === request.fileUri && pending.sizeBytes === source.size) {
    return revalidatePending(uid, pending, source);
  }
  if (pending) {
    // A different file for the same analysis replaces the earlier, unfinished one.
    await PendingUploadStore.remove(uid, pending.uploadId);
    await UploadSessionRepository.cancel(pending.uploadId).catch(() => undefined);
    if (pending.fileUri !== request.fileUri) await releaseUploadCopy(pending.fileUri);
  }

  const fingerprint = await computeUploadFingerprint(source);
  const session = await UploadSessionRepository.create({
    purpose: request.purpose,
    jobId: request.jobId,
    fileName: request.fileName,
    contentType: request.contentType,
    sizeBytes: source.size,
    declaredDurationSec: Math.round(request.declaredDurationSec),
    fingerprint,
    integrity: 'crc32c',
  });
  if (session.state !== 'uploading' || !session.sessionUri) return { kind: 'complete', uploadId: session.uploadId };

  const record: PendingUpload = {
    uploadId: session.uploadId,
    sessionUri: session.sessionUri,
    fileUri: request.fileUri,
    fileName: request.fileName,
    contentType: request.contentType,
    sizeBytes: source.size,
    declaredDurationSec: request.declaredDurationSec,
    jobId: request.jobId,
    purpose: request.purpose,
    chunkBytes: session.chunkBytes,
    createdAt: new Date().toISOString(),
    fingerprint,
  };
  await PendingUploadStore.save(uid, record);
  return { kind: 'transfer', upload: record, fresh: !session.reused };
}

/** A declare that the server refuses means the session was closed (cancelled, expired, withdrawn). */
async function declareChecksum(uploadId: string, crc32c: string): Promise<void> {
  try {
    await UploadSessionRepository.declareChecksum(uploadId, crc32c);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code.endsWith('failed-precondition') || code.endsWith('not-found')) throw new UploadSessionExpiredError();
    throw error;
  }
}

/**
 * Streams a large video into a server-authorized resumable session. Calling it again for the
 * same job and file resumes from the committed offset instead of restarting.
 */
export async function runChunkedUpload(
  uid: string,
  request: UploadRequest,
  callbacks: ChunkedUploadCallbacks = {},
): Promise<ChunkedUploadResult> {
  callbacks.onPreparing?.();
  const source = await openChunkSource(request.fileUri);
  try {
    assertUploadable(source, request);
    const resolved = await resolveSession(uid, request, source);
    if (resolved.kind === 'complete') {
      callbacks.onProgress?.({ sentBytes: source.size, totalBytes: source.size, bytesPerSecond: null, etaSeconds: null });
      return { uploadId: resolved.uploadId, outcome: 'complete' };
    }

    let session = resolved.upload;
    const uploader = new ResumableSessionUploader({
      sessionUri: session.sessionUri,
      source,
      chunkBytes: session.chunkBytes,
      onProgress: callbacks.onProgress,
      integrity: {
        initial: session.committedChecksum ?? null,
        onCommitted: async (committedChecksum) => {
          session = { ...session, committedChecksum };
          await PendingUploadStore.save(uid, session);
        },
        declareFinal: (crc32c) => declareChecksum(session.uploadId, crc32c),
      },
    });
    callbacks.onControl?.({ pause: () => uploader.pause(), cancel: () => uploader.cancel() });

    let outcome: SessionUploadOutcome;
    try {
      outcome = await uploader.run(resolved.fresh ? 0 : undefined);
    } catch (error) {
      if (error instanceof UploadSessionExpiredError) {
        await PendingUploadStore.remove(uid, session.uploadId);
        await UploadSessionRepository.cancel(session.uploadId).catch(() => undefined);
      }
      throw error;
    }

    if (outcome === 'complete') await PendingUploadStore.remove(uid, session.uploadId);
    if (outcome === 'cancelled') {
      await PendingUploadStore.remove(uid, session.uploadId);
      await UploadSessionRepository.cancel(session.uploadId);
    }
    // A completed upload's copy stays briefly for the on-device fallback; the sweep removes it.
    if (outcome === 'cancelled') await releaseUploadCopy(request.fileUri);
    return { uploadId: session.uploadId, outcome };
  } finally {
    source.close();
  }
}

/** Cancels a persisted upload that is not currently running (e.g. from the recovery list). */
export async function discardPendingUpload(uid: string, uploadId: string): Promise<void> {
  const pending = (await PendingUploadStore.list(uid)).find((entry) => entry.uploadId === uploadId);
  await PendingUploadStore.remove(uid, uploadId);
  await UploadSessionRepository.cancel(uploadId);
  if (pending) await releaseUploadCopy(pending.fileUri);
}

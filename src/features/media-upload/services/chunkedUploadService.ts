import { PendingUploadStore } from '@/features/media-upload/repositories/PendingUploadStore';
import { UploadSessionRepository } from '@/features/media-upload/repositories/UploadSessionRepository';
import { type PendingUpload, type UploadRequest } from '@/features/media-upload/types';
import { CHUNKED_UPLOAD } from './chunkPlan';
import { openChunkSource } from './chunkSource';
import { computeUploadFingerprint } from './fingerprint';
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

async function resolveSession(uid: string, request: UploadRequest, source: ChunkSource): Promise<ResolvedSession> {
  const pending = await PendingUploadStore.findForJob(uid, request.jobId);
  if (pending && pending.fileUri === request.fileUri && pending.sizeBytes === source.size) {
    return { kind: 'transfer', upload: pending, fresh: false };
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
  };
  await PendingUploadStore.save(uid, record);
  return { kind: 'transfer', upload: record, fresh: !session.reused };
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

    const session = resolved.upload;
    const uploader = new ResumableSessionUploader({
      sessionUri: session.sessionUri,
      source,
      chunkBytes: session.chunkBytes,
      onProgress: callbacks.onProgress,
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
    return { uploadId: session.uploadId, outcome };
  } finally {
    source.close();
  }
}

/** Cancels a persisted upload that is not currently running (e.g. from the recovery list). */
export async function discardPendingUpload(uid: string, uploadId: string): Promise<void> {
  await PendingUploadStore.remove(uid, uploadId);
  await UploadSessionRepository.cancel(uploadId);
}

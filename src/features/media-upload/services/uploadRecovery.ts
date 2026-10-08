import type { PendingUpload, ServerUploadRecord, UploadRequest } from '@/features/media-upload/types';

/** GCS resumable sessions stay valid for a week; older device records cannot be resumed. */
export const RESUMABLE_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function isPastResumeWindow(createdAt: string, now: number = Date.now()): boolean {
  const age = now - Date.parse(createdAt);
  return Number.isFinite(age) && age > RESUMABLE_SESSION_MAX_AGE_MS;
}

export type RecoveryState =
  /** Bytes still missing and the session is open: offer Resume / Discard. */
  | 'resumable'
  /** Server state unknown (offline); offer Resume, which re-checks on start. */
  | 'unknown'
  /** All bytes arrived; the server is validating or already finished. Drop the local record. */
  | 'finished'
  /** Rejected, cancelled or expired. Drop the local record. */
  | 'closed';

export function classifyPendingUpload(
  pending: PendingUpload,
  server: ServerUploadRecord | 'missing' | null,
  now: number = Date.now(),
): RecoveryState {
  const age = now - Date.parse(pending.createdAt);
  if (server === null) {
    return Number.isFinite(age) && age > RESUMABLE_SESSION_MAX_AGE_MS ? 'closed' : 'unknown';
  }
  if (server === 'missing') return 'closed';
  switch (server.state) {
    case 'uploading':
      return Number.isFinite(age) && age > RESUMABLE_SESSION_MAX_AGE_MS ? 'closed' : 'resumable';
    case 'quarantined':
    case 'validated':
    case 'ready':
      return 'finished';
    default:
      return 'closed';
  }
}

export function requestFromPending(pending: PendingUpload): UploadRequest {
  return {
    purpose: pending.purpose,
    jobId: pending.jobId,
    fileUri: pending.fileUri,
    fileName: pending.fileName,
    contentType: pending.contentType,
    declaredDurationSec: pending.declaredDurationSec,
  };
}

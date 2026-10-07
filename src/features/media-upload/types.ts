import { type UploadContentType } from './services/chunkPlan';

/** Mirrors functions/src/uploads/model.ts. */
export const UPLOAD_STATES = [
  'uploading',
  'quarantined',
  'validated',
  'rejected',
  'ready',
  'cancelled',
  'expired',
] as const;
export type UploadState = (typeof UPLOAD_STATES)[number];

export type UploadPurpose = 'match_footage';

export type UploadRequest = {
  purpose: UploadPurpose;
  jobId: string;
  fileUri: string;
  fileName: string;
  contentType: UploadContentType;
  declaredDurationSec: number;
};

export type UploadSession = {
  uploadId: string;
  sessionUri: string;
  state: UploadState;
  chunkBytes: number;
  reused: boolean;
};

/** Device-local resume record; removed when the upload completes or is cancelled. */
export type PendingUpload = {
  uploadId: string;
  sessionUri: string;
  fileUri: string;
  fileName: string;
  contentType: UploadContentType;
  sizeBytes: number;
  declaredDurationSec: number;
  jobId: string;
  purpose: UploadPurpose;
  chunkBytes: number;
  createdAt: string;
};

export type ServerUploadRecord = {
  uploadId: string;
  state: UploadState;
  jobId: string | null;
  rejectionReason: UploadRejectionReason | null;
};

export type UploadPhase =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'paused'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'cancelled';

export type UploadErrorCode =
  | 'offline'
  | 'session_expired'
  | 'too_large'
  | 'too_long'
  | 'unsupported_type'
  | 'limit_reached'
  | 'consent_required'
  | 'not_allowed'
  | 'file_missing'
  | 'rejected'
  | 'unknown';

export type UploadViewState = {
  phase: UploadPhase;
  uploadId: string | null;
  sentBytes: number;
  totalBytes: number;
  bytesPerSecond: number | null;
  etaSeconds: number | null;
  error: UploadErrorCode | null;
  rejectionReason: UploadRejectionReason | null;
};

/** Mirrors RejectionReason in functions/src/uploads/probe.ts. */
export const UPLOAD_REJECTION_REASONS = [
  'not_video',
  'unsupported_container',
  'unsupported_codec',
  'no_video_stream',
  'too_many_streams',
  'too_short',
  'too_long',
  'resolution',
  'frame_rate',
  'bitrate',
  'size_mismatch',
  'probe_failed',
  'scanner_flagged',
  'job_missing',
] as const;
export type UploadRejectionReason = (typeof UPLOAD_REJECTION_REASONS)[number];

export function parseRejectionReason(value: unknown): UploadRejectionReason | null {
  return typeof value === 'string' && (UPLOAD_REJECTION_REASONS as readonly string[]).includes(value)
    ? (value as UploadRejectionReason)
    : null;
}

export const IDLE_UPLOAD: UploadViewState = {
  phase: 'idle',
  uploadId: null,
  sentBytes: 0,
  totalBytes: 0,
  bytesPerSecond: null,
  etaSeconds: null,
  error: null,
  rejectionReason: null,
};

export function parseUploadState(value: unknown): UploadState | null {
  return typeof value === 'string' && (UPLOAD_STATES as readonly string[]).includes(value)
    ? (value as UploadState)
    : null;
}

export function parseServerUploadRecord(uploadId: string, data: unknown): ServerUploadRecord | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const state = parseUploadState(record.state);
  if (!state) return null;
  return {
    uploadId,
    state,
    jobId: typeof record.jobId === 'string' ? record.jobId : null,
    rejectionReason: parseRejectionReason(record.rejectionReason),
  };
}

export function parsePendingUploads(raw: string | null): PendingUpload[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is PendingUpload => {
      if (!entry || typeof entry !== 'object') return false;
      const item = entry as Record<string, unknown>;
      return typeof item.uploadId === 'string'
        && typeof item.sessionUri === 'string'
        && item.sessionUri.startsWith('https://')
        && typeof item.fileUri === 'string'
        && typeof item.sizeBytes === 'number'
        && typeof item.jobId === 'string'
        && typeof item.chunkBytes === 'number';
    });
  } catch {
    return [];
  }
}

const SERVER_REASONS: Record<string, UploadErrorCode> = {
  limit_reached: 'limit_reached',
  consent_required: 'consent_required',
  not_allowed: 'not_allowed',
  too_large: 'too_large',
  too_small: 'unsupported_type',
  duration: 'too_long',
  content_type: 'unsupported_type',
};

export class UploadFileMissingError extends Error {
  constructor() {
    super('The selected video is no longer available on this device.');
    this.name = 'UploadFileMissingError';
  }
}

/** Maps callable/HTTP failures to user-facing reasons using server `details.reason` codes. */
export function uploadErrorCodeFor(error: unknown): UploadErrorCode {
  if (!error || typeof error !== 'object') return 'unknown';
  const name = error instanceof Error ? error.name : '';
  if (name === 'UploadSessionExpiredError') return 'session_expired';
  if (name === 'UploadFileMissingError') return 'file_missing';
  const details = name === 'UploadValidationError' ? error : 'details' in error ? error.details : null;
  const reason = details && typeof details === 'object' && 'reason' in details ? String(details.reason) : '';
  if (reason in SERVER_REASONS) return SERVER_REASONS[reason];
  const code = 'code' in error ? String(error.code) : '';
  if (code.endsWith('permission-denied') || code.endsWith('failed-precondition')) return 'not_allowed';
  if (code.endsWith('resource-exhausted')) return 'limit_reached';
  if (code.endsWith('unavailable') || name === 'TypeError') return 'offline';
  return 'unknown';
}

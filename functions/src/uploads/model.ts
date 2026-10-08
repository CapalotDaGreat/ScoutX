// Pure upload rules shared by the session callables, the quarantine trigger and unit tests.

export const MiB = 1024 * 1024;
export const GiB = 1024 * MiB;

export const UPLOAD_LIMITS = {
  maxBytes: 4 * GiB,
  maxDurationSec: 150 * 60,
  minBytes: 1024,
  chunkBytes: 8 * MiB,
  /** Uploads that never finish are expired and their quarantine objects deleted. */
  abandonAfterDays: 7,
  maxActivePerUser: 2,
  maxSessionsPerDay: 10,
} as const;

export const UPLOAD_CONTENT_TYPES = ['video/mp4', 'video/quicktime'] as const;
export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];

export const UPLOAD_PURPOSES = ['match_footage'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

/**
 * uploading → quarantined (object finalized) → validated | rejected → ready (promoted to
 * private storage). cancelled and expired are terminal for abandoned sessions.
 */
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

export const ACTIVE_UPLOAD_STATES: readonly UploadState[] = ['uploading', 'quarantined', 'validated'];
export const REUSABLE_UPLOAD_STATES: readonly UploadState[] = ['uploading', 'quarantined', 'validated', 'ready'];

export type UploadSessionRequest = {
  purpose: UploadPurpose;
  jobId: string;
  fileName: string;
  contentType: UploadContentType;
  sizeBytes: number;
  declaredDurationSec: number;
  fingerprint: string;
  /** 'crc32c': the client will declare the whole-file CRC32C, so quarantine requires a match. */
  integrity: 'crc32c' | 'none';
};

export type UploadRequestError =
  | 'purpose'
  | 'job'
  | 'content_type'
  | 'too_small'
  | 'too_large'
  | 'duration'
  | 'fingerprint';

const JOB_ID = /^[A-Za-z0-9_-]{6,80}$/;
const FINGERPRINT = /^[a-f0-9]{64}$/;

export function sanitizeFileName(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  const base = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[^A-Za-z0-9._ -]/g, '').trim().slice(0, 80);
  return cleaned || 'video';
}

export function parseUploadRequest(
  data: Record<string, unknown>,
): { ok: true; value: UploadSessionRequest } | { ok: false; error: UploadRequestError } {
  if (!(UPLOAD_PURPOSES as readonly unknown[]).includes(data.purpose)) return { ok: false, error: 'purpose' };
  if (typeof data.jobId !== 'string' || !JOB_ID.test(data.jobId)) return { ok: false, error: 'job' };
  if (!(UPLOAD_CONTENT_TYPES as readonly unknown[]).includes(data.contentType)) return { ok: false, error: 'content_type' };
  const size = data.sizeBytes;
  if (typeof size !== 'number' || !Number.isInteger(size) || size < UPLOAD_LIMITS.minBytes) {
    return { ok: false, error: 'too_small' };
  }
  if (size > UPLOAD_LIMITS.maxBytes) return { ok: false, error: 'too_large' };
  const duration = data.declaredDurationSec;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || duration > UPLOAD_LIMITS.maxDurationSec) {
    return { ok: false, error: 'duration' };
  }
  if (typeof data.fingerprint !== 'string' || !FINGERPRINT.test(data.fingerprint)) return { ok: false, error: 'fingerprint' };
  return {
    ok: true,
    value: {
      purpose: data.purpose as UploadPurpose,
      jobId: data.jobId,
      fileName: sanitizeFileName(data.fileName),
      contentType: data.contentType as UploadContentType,
      sizeBytes: size,
      declaredDurationSec: Math.round(duration),
      fingerprint: data.fingerprint,
      integrity: data.integrity === 'crc32c' ? 'crc32c' : 'none',
    },
  };
}

const CRC32C_BASE64 = /^[A-Za-z0-9+/]{6}==$/;

export function isCrc32cBase64(value: unknown): value is string {
  return typeof value === 'string' && CRC32C_BASE64.test(value);
}

/**
 * GCS reports `crc32c` as base64 of the big-endian value; the Storage emulator may report the
 * decimal form. Returns the canonical base64 form, or null when absent or unreadable.
 */
export function normalizeCrc32c(value: unknown): string | null {
  if (isCrc32cBase64(value)) return value;
  if (typeof value === 'string' && /^\d{1,10}$/.test(value)) {
    const number = Number(value);
    if (number > 0xffffffff) return null;
    const bytes = Buffer.alloc(4);
    bytes.writeUInt32BE(number);
    return bytes.toString('base64');
  }
  return null;
}

export type IntegrityVerdict = 'verified' | 'mismatch' | 'missing_declaration' | 'not_requested' | 'no_server_hash';

/**
 * The client-declared value is never proof by itself: it only counts when it equals the CRC32C
 * Cloud Storage computed over the bytes it actually stored.
 */
export function integrityVerdict(
  mode: unknown,
  declared: unknown,
  stored: unknown,
): IntegrityVerdict {
  if (mode !== 'crc32c') return 'not_requested';
  if (!isCrc32cBase64(declared)) return 'missing_declaration';
  const server = normalizeCrc32c(stored);
  if (!server) return 'no_server_hash';
  return server === declared ? 'verified' : 'mismatch';
}

export function quarantinePath(uid: string, uploadId: string): string {
  return `quarantine/${uid}/${uploadId}/source`;
}

/** Parses quarantine/{uid}/{uploadId}/source; anything else is not ours. */
export function parseQuarantinePath(path: string): { uid: string; uploadId: string } | null {
  const match = /^quarantine\/([^/]+)\/([^/]+)\/source$/.exec(path);
  return match ? { uid: match[1], uploadId: match[2] } : null;
}

export function matchFootagePath(uid: string, jobId: string): string {
  return `profiles/${uid}/matchFootage/${jobId}/video.mp4`;
}

export function footageMediaId(jobId: string): string {
  return `footage_${jobId}`;
}

export function isAbandoned(createdAtIso: string, now: Date, days: number = UPLOAD_LIMITS.abandonAfterDays): boolean {
  const created = Date.parse(createdAtIso);
  return Number.isFinite(created) && now.getTime() - created > days * 86_400_000;
}

export function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

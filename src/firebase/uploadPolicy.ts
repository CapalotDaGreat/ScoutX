const MB = 1024 * 1024;

/** Mirrors storage.rules so oversized files fail before any bytes are sent. */
export const UPLOAD_LIMITS = {
  highlightVideo: 100 * MB,
  highlightThumbnail: 5 * MB,
  matchFootage: 4 * 1024 * MB,
  matchFrame: 2 * MB,
} as const;

export const DEFAULT_UPLOAD_RETRIES = 3;

const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  'storage/retry-limit-exceeded',
  'storage/unknown',
  'storage/server-file-wrong-size',
  'storage/network-request-failed',
]);

export class UploadTooLargeError extends Error {
  readonly code = 'upload_too_large';

  readonly sizeBytes: number;
  readonly maxBytes: number;

  constructor(sizeBytes: number, maxBytes: number) {
    super(`File is ${Math.round(sizeBytes / MB)} MB; the limit is ${Math.round(maxBytes / MB)} MB.`);
    this.sizeBytes = sizeBytes;
    this.maxBytes = maxBytes;
  }
}

export function isRetryableUploadError(error: unknown): boolean {
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' && RETRYABLE_CODES.has(code);
}

/** Exponential backoff: 1 s, 2 s, 4 s … capped at 15 s. */
export function retryDelayMs(attempt: number): number {
  return Math.min(15_000, 1000 * 2 ** Math.max(0, attempt));
}

export function assertWithinLimit(sizeBytes: number, maxBytes: number | undefined): void {
  if (maxBytes !== undefined && sizeBytes > maxBytes) {
    throw new UploadTooLargeError(sizeBytes, maxBytes);
  }
}

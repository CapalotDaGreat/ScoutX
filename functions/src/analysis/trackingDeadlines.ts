/** Client ends first, then task, then lease. A timeout retry starts after the retained lease expires. */
export const TRACKING_TASK_TIMEOUT_SEC = 1800;
export const TRACKING_WORKER_CLIENT_MS = 28 * 60 * 1000;
export const TRACKING_ATTEMPT_LEASE_MS = 31 * 60 * 1000;
export const TRACKING_TIMEOUT_BACKOFF_SEC = 4 * 60;
export const RESOLVE_MAX_ATTEMPTS = 3;
export const OCR_REFRESH_MAX_ATTEMPTS = 2;

/** Only a resolve client's own deadline is retryable; an HTTP rejection remains a null response. */
export class TrackingWorkerTimeout extends Error {
  constructor() { super('tracking worker timed out'); this.name = 'TrackingWorkerTimeout'; }
}

export function isAbortTimeout(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'name' in error
    && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

export function timeoutWillRetry(attempt: number, maxAttempts: number): boolean {
  return Number.isSafeInteger(attempt) && attempt >= 0 && attempt + 1 < maxAttempts;
}

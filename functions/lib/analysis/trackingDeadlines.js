"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackingWorkerTimeout = exports.OCR_REFRESH_MAX_ATTEMPTS = exports.RESOLVE_MAX_ATTEMPTS = exports.TRACKING_TIMEOUT_BACKOFF_SEC = exports.TRACKING_ATTEMPT_LEASE_MS = exports.TRACKING_WORKER_CLIENT_MS = exports.TRACKING_TASK_TIMEOUT_SEC = void 0;
exports.isAbortTimeout = isAbortTimeout;
exports.timeoutWillRetry = timeoutWillRetry;
/** Client ends first, then task, then lease. A timeout retry starts after the retained lease expires. */
exports.TRACKING_TASK_TIMEOUT_SEC = 1800;
exports.TRACKING_WORKER_CLIENT_MS = 28 * 60 * 1000;
exports.TRACKING_ATTEMPT_LEASE_MS = 31 * 60 * 1000;
exports.TRACKING_TIMEOUT_BACKOFF_SEC = 4 * 60;
exports.RESOLVE_MAX_ATTEMPTS = 3;
exports.OCR_REFRESH_MAX_ATTEMPTS = 2;
/** Only a resolve client's own deadline is retryable; an HTTP rejection remains a null response. */
class TrackingWorkerTimeout extends Error {
    constructor() { super('tracking worker timed out'); this.name = 'TrackingWorkerTimeout'; }
}
exports.TrackingWorkerTimeout = TrackingWorkerTimeout;
function isAbortTimeout(error) {
    return !!error && typeof error === 'object' && 'name' in error
        && (error.name === 'TimeoutError' || error.name === 'AbortError');
}
function timeoutWillRetry(attempt, maxAttempts) {
    return Number.isSafeInteger(attempt) && attempt >= 0 && attempt + 1 < maxAttempts;
}
//# sourceMappingURL=trackingDeadlines.js.map
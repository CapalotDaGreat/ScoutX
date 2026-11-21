"use strict";
/**
 * Clocks for the tracking tasks. One place, so the worker client, the Cloud Function timeout,
 * the Cloud Tasks dispatch deadline and the claim lease cannot drift apart.
 *
 * Cloud Tasks will not keep a dispatch open past 30 minutes. The client aborts first, leaving
 * the function time to record the outcome. The lease is longer than the function, so a duplicate
 * delivery cannot steal a claim from an attempt that might still be running.
 *
 * The Cloud Run service that hosts the worker must use a request timeout of at least
 * TRACKING_TASK_TIMEOUT_SEC. A shorter service timeout kills the worker while this client is
 * still waiting, and that disconnect is not a retryable timeout.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackingWorkerTimeout = exports.OCR_REFRESH_MAX_ATTEMPTS = exports.RESOLVE_MAX_ATTEMPTS = exports.TRACKING_ATTEMPT_LEASE_MS = exports.TRACKING_WORKER_CLIENT_MS = exports.TRACKING_TASK_TIMEOUT_SEC = void 0;
exports.isWorkerTimeout = isWorkerTimeout;
exports.timeoutWillRetry = timeoutWillRetry;
exports.TRACKING_TASK_TIMEOUT_SEC = 1800;
exports.TRACKING_WORKER_CLIENT_MS = 28 * 60 * 1000;
exports.TRACKING_ATTEMPT_LEASE_MS = 31 * 60 * 1000;
exports.RESOLVE_MAX_ATTEMPTS = 3;
exports.OCR_REFRESH_MAX_ATTEMPTS = 2;
/** Thrown when the worker HTTP client hits its own deadline. Distinct from a rejected response. */
class TrackingWorkerTimeout extends Error {
    constructor() {
        super('tracking worker timed out');
        this.name = 'TrackingWorkerTimeout';
    }
}
exports.TrackingWorkerTimeout = TrackingWorkerTimeout;
function isWorkerTimeout(error) {
    if (error instanceof TrackingWorkerTimeout)
        return true;
    if (!error || typeof error !== 'object')
        return false;
    const name = error.name;
    return name === 'TimeoutError' || name === 'AbortError';
}
/** True when Cloud Tasks will dispatch another attempt after this one (attempt is 0-based). */
function timeoutWillRetry(attempt, maxAttempts) {
    return Number.isInteger(attempt) && attempt >= 0 && attempt + 1 < maxAttempts;
}
//# sourceMappingURL=trackingDeadlines.js.map
"use strict";
/**
 * Video Intelligence 5.2 - deferred number reading after a correction.
 *
 * A correction answers within seconds because the worker reads no new shirt-number crops
 * (5.1); it reports how many it deferred (`report.ocrDeferred`). This module decides, from
 * persisted facts only, whether a bounded background follow-up ("refresh") should read them:
 *
 *   - one follow-up chain per feedback revision, at most MAX_ROUNDS rounds;
 *   - a further round only when the previous one made progress (fewer deferred crops) - so a
 *     chain can never loop on the same crops;
 *   - each round reads at most MAX_CROPS crops (worker-enforced);
 *   - a newer answer supersedes the chain (stale); a cancelled analysis stops it;
 *   - a per-user daily quota bounds the total.
 *
 * Dependency-free so the unit suite imports it directly.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OCR_FOLLOW_UP_ACTION = exports.OCR_FOLLOW_UP_DAILY_LIMIT = exports.OCR_FOLLOW_UP_MAX_CROPS = exports.OCR_FOLLOW_UP_MAX_ROUNDS = void 0;
exports.planOcrFollowUp = planOcrFollowUp;
exports.followUpTaskId = followUpTaskId;
exports.followUpRunnable = followUpRunnable;
exports.followUpVisible = followUpVisible;
exports.OCR_FOLLOW_UP_MAX_ROUNDS = 3;
exports.OCR_FOLLOW_UP_MAX_CROPS = 400;
/** Per user per day, counted in `callableRateLimits/{uid}_ocr_follow_up_{day}`. */
exports.OCR_FOLLOW_UP_DAILY_LIMIT = 60;
exports.OCR_FOLLOW_UP_ACTION = 'ocr_follow_up';
/**
 * The follow-up state to store with a just-published report.
 * `prev` = the follow-up stored before; `ranRound` = the round this resolve executed (refresh only).
 */
function planOcrFollowUp(scope, revision, ocrDeferred, prev, at, ranRound = null, quotaLeft = true) {
    const deferred = Math.max(0, Math.floor(ocrDeferred || 0));
    if (scope === 'refresh') {
        if (!prev || prev.revision !== revision || ranRound === null || prev.round !== ranRound)
            return prev;
        const progressed = deferred < prev.deferredBefore;
        if (deferred > 0 && progressed && ranRound < exports.OCR_FOLLOW_UP_MAX_ROUNDS) {
            return { revision, round: ranRound + 1, status: quotaLeft ? 'scheduled' : 'limited', deferredBefore: deferred,
                deferredAfter: null, updatedAt: at };
        }
        return { ...prev, status: 'done', deferredAfter: deferred, updatedAt: at };
    }
    // feedback / orchestrated resolves start a new chain for this revision when crops were deferred
    if (deferred === 0) {
        return prev && prev.revision === revision ? prev : null;
    }
    if (prev && prev.revision === revision && ['scheduled', 'running'].includes(prev.status))
        return prev;
    return { revision, round: 1, status: quotaLeft ? 'scheduled' : 'limited', deferredBefore: deferred, deferredAfter: null, updatedAt: at };
}
/** Deterministic Cloud Tasks id: a retried publish never schedules the same round twice. */
function followUpTaskId(jobId, revision, round) {
    return `ocr-follow-up-${jobId}-r${revision}-n${round}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 480);
}
/** May the task for (revision, round) run now? Anything else is a duplicate or stale task. */
function followUpRunnable(stored, revision, round) {
    return !!stored && stored.revision === revision && stored.round === round && ['scheduled', 'running'].includes(stored.status);
}
/** The app shows "Checking a few additional moments" only while a follow-up is really queued or running. */
function followUpVisible(f) {
    return !!f && (f.status === 'scheduled' || f.status === 'running');
}
//# sourceMappingURL=trackingFollowUp.js.map
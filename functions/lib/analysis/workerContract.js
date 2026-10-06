"use strict";
/**
 * Contract for a future GPU / computer-vision worker.
 *
 * ScoutX currently samples still frames and reasons over them with a vision LLM.
 * Team detection, pitch mapping, continuous tracking and event detection are not
 * implemented. Those stages must be written as `unavailable`, never `complete`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CV_UNAVAILABLE_REASON = exports.CV_WORKER_STAGES = exports.ANALYSIS_LEASE_MS = exports.ANALYSIS_MAX_ATTEMPTS = exports.ANALYSIS_DAILY_QUOTA = void 0;
exports.dailyQuotaCount = dailyQuotaCount;
exports.isDailyQuotaReached = isDailyQuotaReached;
exports.unavailableCvOutputs = unavailableCvOutputs;
exports.isCvWorkerStage = isCvWorkerStage;
exports.ANALYSIS_DAILY_QUOTA = 8;
exports.ANALYSIS_MAX_ATTEMPTS = 3;
exports.ANALYSIS_LEASE_MS = 4 * 60 * 1000;
exports.CV_WORKER_STAGES = [
    'match-segmentation',
    'player-tracking',
    'event-detection',
    'tactical-context',
    'role-analysis',
];
exports.CV_UNAVAILABLE_REASON = 'Computer-vision worker is not deployed. ScoutX will not invent tracking, pitch maps, or event counts.';
function dailyQuotaCount(storedDay, storedCount, day) {
    return storedDay === day && typeof storedCount === 'number' ? storedCount : 0;
}
function isDailyQuotaReached(count, limit = exports.ANALYSIS_DAILY_QUOTA) {
    return count >= limit;
}
function unavailableCvOutputs() {
    return exports.CV_WORKER_STAGES.map((stageId) => ({
        stageId,
        status: 'unavailable',
        reason: exports.CV_UNAVAILABLE_REASON,
    }));
}
function isCvWorkerStage(stageId) {
    return exports.CV_WORKER_STAGES.includes(stageId);
}
//# sourceMappingURL=workerContract.js.map
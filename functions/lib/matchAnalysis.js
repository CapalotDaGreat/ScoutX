"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelMatchAnalysis = exports.analyzeMatchFootage = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const callableOptions_1 = require("./callableOptions");
const frameAnalysis_1 = require("./analysis/frameAnalysis");
const pipeline_1 = require("./analysis/pipeline");
const stateMachine_1 = require("./analysis/stateMachine");
const sessions_1 = require("./uploads/sessions");
const openRouterApiKey = (0, params_1.defineSecret)('OPENROUTER_API_KEY');
function requireJobId(data) {
    const jobId = data?.jobId;
    if (!jobId || typeof jobId !== 'string')
        throw new https_1.HttpsError('invalid-argument', 'jobId is required.');
    return jobId;
}
/**
 * Runs (or re-runs) analysis for a job. Server-extracted jobs without enough frames restart
 * the extraction pipeline; jobs with frames (including the short-clip device fallback) are
 * analysed directly.
 */
exports.analyzeMatchFootage = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)({ secrets: [openRouterApiKey], timeoutSeconds: 300, memory: '1GiB' }), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Authentication is required.');
    const jobId = requireJobId(request.data);
    const idempotencyKey = typeof request.data.idempotencyKey === 'string'
        ? request.data.idempotencyKey
        : undefined;
    const db = (0, firestore_1.getFirestore)();
    const snap = await db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).get();
    if (!snap.exists)
        throw new https_1.HttpsError('not-found', 'Match analysis job not found.');
    const job = snap.data();
    if (job.playerId !== uid)
        throw new https_1.HttpsError('permission-denied', 'You can only analyze your own footage.');
    const state = (0, frameAnalysis_1.pipelineStateOf)(job);
    if (job.videoStoragePath) {
        if (state === 'queued' || state === 'extracting')
            return { jobId, status: 'queued' };
        const frameCount = Array.isArray(job.frames) ? job.frames.length : 0;
        if (state === 'failed' && frameCount < frameAnalysis_1.MIN_ANALYSIS_FRAMES) {
            const outcome = await (0, pipeline_1.startMatchPipeline)(db, jobId);
            if (outcome === 'queued')
                return { jobId, status: 'queued' };
            throw new https_1.HttpsError('unavailable', 'Analysis could not be queued. Try again later.', { reason: 'queue_unavailable' });
        }
    }
    const apiKey = openRouterApiKey.value();
    if (!apiKey)
        throw new https_1.HttpsError('failed-precondition', 'OpenRouter API key is not configured.');
    return (0, frameAnalysis_1.runFrameAnalysis)({
        db,
        uid,
        jobId,
        requestId: `${uid}:${jobId}:${Date.now()}`,
        idempotencyKey,
        apiKey,
    });
});
/** Owner-only cancel: stops uploads and workers; finished results are never altered. */
exports.cancelMatchAnalysis = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Authentication is required.');
    const jobId = requireJobId(request.data);
    const db = (0, firestore_1.getFirestore)();
    const jobRef = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId);
    const status = await db.runTransaction(async (tx) => {
        const snap = await tx.get(jobRef);
        if (!snap.exists)
            throw new https_1.HttpsError('not-found', 'Match analysis job not found.');
        const job = snap.data();
        if (job.playerId !== uid)
            throw new https_1.HttpsError('permission-denied', 'You can only cancel your own analysis.');
        const state = (0, frameAnalysis_1.pipelineStateOf)(job);
        if (stateMachine_1.TERMINAL_PIPELINE_STATES.includes(state))
            return String(job.status);
        tx.update(jobRef, {
            cancelRequested: true,
            status: 'cancelled',
            pipelineState: 'cancelled',
            cancelledAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        return 'cancelled';
    });
    if (status === 'cancelled')
        await (0, sessions_1.discardUploadsForJob)(db, uid, jobId);
    return { jobId, status };
});
//# sourceMappingURL=matchAnalysis.js.map
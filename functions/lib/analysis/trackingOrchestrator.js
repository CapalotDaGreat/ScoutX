"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTrackingSegmentTask = exports.startPlayerAnalysis = exports.cloudTasksEnqueue = exports.EXTRACT_MAX_ATTEMPTS = exports.PLAYER_ANALYSIS_START_LIMIT = void 0;
exports.startAnalysis = startAnalysis;
exports.processExtractTask = processExtractTask;
/**
 * Video Intelligence 4.0 - progressive, resumable player analysis.
 *
 *   startPlayerAnalysis (owner callable)
 *     -> plans the recording into segments (trackingProgress.planSegments)
 *     -> enqueues one extractTrackingSegmentTask per segment (retryable, rate limited)
 *   extractTrackingSegmentTask
 *     -> worker /v3/tracking:extract with a short-lived signed source URL (stage 1 artifacts are
 *        cached per segment on the worker, so a retry never re-processes finished footage)
 *     -> records the worker-measured processing time (real throughput, no invented percentages)
 *     -> enqueues a preliminary resolve while extraction continues, and the full resolve at the end
 *   resolveTrackingTask (trackingCallables.ts)
 *     -> publishes the report; a preliminary report never overwrites a fuller one
 *
 * The same gates as before apply: nothing runs unless TRACKING_V3_ENABLED=true and the approved
 * CV worker is available, the caller owns the job and holds current video consent.
 */
const firestore_1 = require("firebase-admin/firestore");
const functions_1 = require("firebase-admin/functions");
const https_1 = require("firebase-functions/v2/https");
const tasks_1 = require("firebase-functions/v2/tasks");
const callableOptions_1 = require("../callableOptions");
const region_1 = require("../region");
const notificationProducers_1 = require("../notificationProducers");
const rateLimit_1 = require("../security/rateLimit");
const mediaSource_1 = require("../uploads/mediaSource");
const cvConfig_1 = require("./cvConfig");
const frameAnalysis_1 = require("./frameAnalysis");
const trackingV3_1 = require("./trackingV3");
const trackingCallables_1 = require("./trackingCallables");
const trackingProgress_1 = require("./trackingProgress");
const videoConsent_1 = require("./videoConsent");
const JOB_ID = /^[A-Za-z0-9_-]{1,80}$/;
exports.PLAYER_ANALYSIS_START_LIMIT = { action: 'player_analysis_start', max: 10, window: 'day' };
exports.EXTRACT_MAX_ATTEMPTS = 3;
const cloudTasksEnqueue = async (queue, payload) => {
    await (0, functions_1.getFunctions)().taskQueue((0, region_1.taskQueueName)(queue)).enqueue(payload, { dispatchDeadlineSeconds: 1800 });
};
exports.cloudTasksEnqueue = cloudTasksEnqueue;
function progressRef(db, jobId) {
    return db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).collection(trackingV3_1.TRACKING_COLLECTION).doc('progress');
}
/**
 * Starts (or resumes) the progressive analysis for an owned job. Idempotent: a running or
 * finished analysis is returned as is; an interrupted one is resumed from its unfinished
 * segments (finished segments are cached and never processed twice).
 */
async function startAnalysis(db, uid, jobId, enqueue, env = process.env, now = new Date(), notify) {
    if (!JOB_ID.test(jobId))
        throw new https_1.HttpsError('invalid-argument', 'Invalid analysis.');
    const jobRef = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId);
    const ready = (0, trackingV3_1.trackingV3Enabled)(env) && (0, cvConfig_1.cvWorkerStatus)(env) === 'available';
    const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(jobRef);
        const consent = await tx.get(db.collection(videoConsent_1.VIDEO_CONSENT_COLLECTION).doc(jobId));
        const prog = await tx.get(progressRef(db, jobId));
        if (!snap.exists)
            throw new https_1.HttpsError('not-found', 'Analysis not found.');
        const job = snap.data();
        if (job.playerId !== uid)
            throw new https_1.HttpsError('permission-denied', 'Only the owner can start this analysis.');
        const at = now.toISOString();
        const existing = prog.exists ? prog.data() : null;
        const block = !consent.exists || consent.get('uid') !== uid || consent.get('revokedAt') !== null
            || consent.get('policyVersion') !== videoConsent_1.VIDEO_CONSENT_VERSION ? 'consent_required'
            : !job.videoStoragePath || !(job.measuredDurationSec ?? job.durationSec) ? 'source_missing'
                : !ready ? 'worker_unavailable' : null;
        if (block) {
            const p = existing ?? (0, trackingProgress_1.newProgress)(1, job.measuredDurationSec ?? job.durationSec ?? 0, at);
            tx.set(progressRef(db, jobId), { ...p, blocked: block, updatedAt: at });
            return { status: 'blocked', generation: p.generation, segments: p.plan.length, blocked: block, toQueue: [], job };
        }
        if (existing && !existing.outcome && !existing.blocked) {
            return { status: existing.full ? 'complete' : 'running', generation: existing.generation,
                segments: existing.plan.length, toQueue: [], job };
        }
        // New analysis, or resume after an interruption/block: same generation keeps finished segments.
        const base = existing && existing.plan.length > 0 ? existing
            : (0, trackingProgress_1.newProgress)((existing?.generation ?? 0) + 1, job.measuredDurationSec ?? job.durationSec, at);
        const segments = { ...base.segments };
        const toQueue = [];
        for (const s of base.plan) {
            const st = segments[String(s.index)];
            if (st?.status !== 'done') {
                segments[String(s.index)] = { status: 'queued', attempts: 0 };
                toQueue.push(s.index);
            }
        }
        tx.set(progressRef(db, jobId), { ...base, segments, outcome: null, blocked: null, updatedAt: at,
            startedAt: existing?.outcome ? at : base.startedAt });
        return { status: 'started', generation: base.generation, segments: base.plan.length, toQueue, job };
    });
    for (const index of result.toQueue) {
        await enqueue('extractTrackingSegmentTask', { jobId, generation: result.generation, index });
    }
    if (result.status === 'started' && result.toQueue.length === 0) {
        // Every segment was already cached: only the report needs (re)building.
        await enqueue('resolveTrackingTask', { jobId, feedbackRevision: 0, scope: 'full' });
    }
    if (result.status === 'started') {
        // In-app activity only: "analysis_started" has no push category, so it never interrupts.
        await (notify ?? ((id, input) => (0, notificationProducers_1.writeSystemActivity)(db, id, input)))((0, trackingProgress_1.notificationId)('started', jobId, result.generation), { recipientId: uid, recipientRole: 'player',
            type: 'analysis_started', category: 'analysis', title: 'Analysis started',
            body: 'PitchProof is finding your moments. You can leave the app; we will let you know when they are ready.',
            reference: { entityType: 'match_analysis', entityId: jobId, label: 'Match analysis' } });
    }
    return { status: result.status, generation: result.generation, segments: result.segments,
        ...(result.status === 'blocked' ? { blocked: result.blocked } : {}) };
}
/**
 * One segment of stage 1. `attempt` is the Cloud Tasks retry count (0-based); a failure on the
 * last attempt marks the analysis interrupted and notifies the owner once.
 */
async function processExtractTask(db, jobId, generation, index, attempt, client, enqueue, env = process.env, sourceUrl = async (p) => (await (0, mediaSource_1.readableSourceFor)(p, 60 * 60 * 1000)).url, now = () => new Date(), notify) {
    const ref = progressRef(db, jobId);
    const jobSnap = await db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).get();
    const job = jobSnap.data();
    const progSnap = await ref.get();
    const prog = progSnap.exists ? progSnap.data() : null;
    if (!job || !prog || prog.generation !== generation || prog.outcome)
        return 'stale';
    if (job.cancelRequested) {
        await ref.set({ outcome: 'cancelled', updatedAt: now().toISOString() }, { merge: true });
        return 'cancelled';
    }
    const seg = prog.plan.find((s) => s.index === index);
    if (!seg || prog.segments[String(index)]?.status === 'done')
        return 'stale';
    if (!client || !(0, trackingV3_1.trackingV3Enabled)(env) || (0, cvConfig_1.cvWorkerStatus)(env) !== 'available' || !job.videoStoragePath) {
        await ref.set({ blocked: 'worker_unavailable', updatedAt: now().toISOString() }, { merge: true });
        return 'unavailable';
    }
    await ref.set({ segments: { [String(index)]: { status: 'running', attempts: attempt + 1, startedAt: now().toISOString() } },
        updatedAt: now().toISOString() }, { merge: true });
    const res = await client({
        contractVersion: 3, jobId, segmentIndex: index, startSec: seg.startSec, endSec: seg.endSec,
        source: { url: await sourceUrl(job.videoStoragePath) },
        privacy: { retainNonTargetIdentities: false, faceRecognition: false, persistMedia: false },
    });
    const at = now().toISOString();
    if (!res || (res.status !== 'complete' && res.status !== 'cached')) {
        const last = attempt + 1 >= exports.EXTRACT_MAX_ATTEMPTS;
        await ref.set({ segments: { [String(index)]: { status: last ? 'failed' : 'queued', attempts: attempt + 1 } },
            ...(last ? { outcome: 'interrupted' } : {}), updatedAt: at }, { merge: true });
        if (!last)
            return 'retry';
        await (notify ?? ((id, input) => (0, notificationProducers_1.writeSystemActivity)(db, id, input)))((0, trackingProgress_1.notificationId)('interrupted', jobId, generation), {
            recipientId: job.playerId, recipientRole: 'player', type: 'analysis_interrupted', category: 'analysis',
            title: 'Analysis paused', body: 'Part of your match could not be analysed. Open it to resume - finished parts are kept.',
            reference: { entityType: 'match_analysis', entityId: jobId, label: 'Match analysis' }
        });
        return 'failed';
    }
    const processingSec = typeof res.processingSec === 'number' && Number.isFinite(res.processingSec) && res.processingSec >= 0
        ? res.processingSec : undefined;
    // Mark done and decide the next step atomically, so concurrent segments agree on who triggers what.
    const next = await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(ref)).data();
        if (!fresh || fresh.generation !== generation)
            return null;
        const segments = { ...fresh.segments, [String(index)]: { status: 'done', attempts: attempt + 1, doneAt: at,
                ...(processingSec !== undefined ? { processingSec } : {}) } };
        const done = (0, trackingProgress_1.doneCount)({ segments });
        const total = fresh.plan.length;
        let resolve = null;
        if (done >= total)
            resolve = 'full';
        else if (fresh.resolving === null && (0, trackingProgress_1.shouldResolvePreliminary)(done, total, fresh.preliminary?.moments ?? null))
            resolve = 'preliminary';
        tx.set(ref, { segments, updatedAt: at, ...(resolve ? { resolving: resolve } : {}) }, { merge: true });
        return resolve;
    });
    if (next)
        await enqueue('resolveTrackingTask', { jobId, feedbackRevision: 0, scope: next });
    return res.status === 'cached' ? 'cached' : 'done';
}
exports.startPlayerAnalysis = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in first.');
    const jobId = request.data?.jobId;
    if (typeof jobId !== 'string')
        throw new https_1.HttpsError('invalid-argument', 'Invalid analysis.');
    await (0, rateLimit_1.assertCallableRateLimit)(uid, exports.PLAYER_ANALYSIS_START_LIMIT);
    return startAnalysis((0, firestore_1.getFirestore)(), uid, jobId, exports.cloudTasksEnqueue);
});
exports.extractTrackingSegmentTask = (0, tasks_1.onTaskDispatched)({ retryConfig: { maxAttempts: exports.EXTRACT_MAX_ATTEMPTS, minBackoffSeconds: 60 }, rateLimits: { maxConcurrentDispatches: 6 },
    timeoutSeconds: 1800, memory: '512MiB' }, async (request) => {
    const d = request.data;
    if (typeof d.jobId !== 'string' || !JOB_ID.test(d.jobId) || !Number.isSafeInteger(d.generation)
        || !Number.isSafeInteger(d.index))
        return;
    const url = (0, cvConfig_1.cvWorkerUrl)();
    const outcome = await processExtractTask((0, firestore_1.getFirestore)(), d.jobId, d.generation, d.index, request.retryCount ?? 0, url ? (0, trackingCallables_1.httpTrackingClient)(url, process.env, 'extract', 28 * 60 * 1000) : null, exports.cloudTasksEnqueue);
    // Throwing hands the retry (with backoff) to Cloud Tasks; finished segments are cached on the worker.
    if (outcome === 'retry')
        throw new Error('segment extraction failed; retrying');
});
//# sourceMappingURL=trackingOrchestrator.js.map
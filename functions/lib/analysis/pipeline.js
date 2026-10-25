"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeMatchFrames = exports.extractMatchSegment = exports.ffmpegFrameExtractor = exports.TASK_MAX_ATTEMPTS = exports.CONCURRENCY_RETRY_DELAY_SEC = void 0;
exports.setFrameExtractor = setFrameExtractor;
exports.startMatchPipeline = startMatchPipeline;
exports.processExtractTask = processExtractTask;
exports.processAnalyzeTask = processAnalyzeTask;
const node_child_process_1 = require("node:child_process");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const tasks_1 = require("firebase-functions/v2/tasks");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const firebase_functions_1 = require("firebase-functions");
const mediaSource_1 = require("../uploads/mediaSource");
const quotaService_1 = require("../entitlements/quotaService");
const frameAnalysis_1 = require("./frameAnalysis");
const segments_1 = require("./segments");
const stages_1 = require("./stages");
const stateMachine_1 = require("./stateMachine");
const taskDispatcher_1 = require("./taskDispatcher");
const redact_1 = require("../logging/redact");
const openRouterApiKey = (0, params_1.defineSecret)('OPENROUTER_API_KEY');
/** Jobs beyond the plan's concurrent-job cap wait in the queue and are re-delivered later. */
exports.CONCURRENCY_RETRY_DELAY_SEC = 120;
exports.TASK_MAX_ATTEMPTS = 3;
const EXTRACT_TIMEOUT_MS = 8 * 60 * 1000;
function runFfmpeg(args, cwd) {
    const binary = ffmpeg_static_1.default;
    if (!binary)
        return Promise.reject(new Error('ffmpeg binary unavailable'));
    return new Promise((resolve, reject) => {
        (0, node_child_process_1.execFile)(binary, args, { cwd, timeout: EXTRACT_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 }, (error, _stdout, stderr) => {
            if (error)
                reject(new Error(`ffmpeg failed (${error.code ?? 'signal'})`));
            else
                resolve(String(stderr));
        });
    });
}
/** Scene-adaptive key-frame extraction streamed from storage; frames go to the owner's private path. */
exports.ffmpegFrameExtractor = {
    async extract({ uid, jobId, videoPath, segment }) {
        const workDir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'scoutx-frames-'));
        try {
            const source = await (0, mediaSource_1.readableSourceFor)(videoPath, 30 * 60 * 1000);
            const stderr = await runFfmpeg((0, segments_1.extractionArgs)({
                sourceUrl: source.url,
                headers: source.headers,
                startSec: segment.startSec,
                durationSec: segment.endSec - segment.startSec,
                outputPattern: (0, node_path_1.join)(workDir, 'f_%03d.jpg'),
            }), workDir);
            const times = (0, segments_1.parseShowinfoTimes)(stderr);
            const files = (await (0, promises_1.readdir)(workDir)).filter((name) => name.endsWith('.jpg')).sort();
            const bucket = (0, storage_1.getStorage)().bucket();
            const frames = [];
            for (const [position, name] of files.entries()) {
                const index = (0, segments_1.frameIndexFor)(segment.index, position);
                const storagePath = `profiles/${uid}/matchFootage/${jobId}/frames/frame_${index}.jpg`;
                await bucket.upload((0, node_path_1.join)(workDir, name), {
                    destination: storagePath,
                    contentType: 'image/jpeg',
                    metadata: { metadata: { ownerId: uid, jobId } },
                });
                const offset = times[position] ?? 0;
                frames.push({
                    id: `frame_${index}`,
                    index,
                    timestampSec: Math.min(segment.endSec, Math.round(segment.startSec + offset)),
                    storagePath,
                    downloadUrl: '',
                    source: 'server',
                });
            }
            return frames;
        }
        finally {
            await (0, promises_1.rm)(workDir, { recursive: true, force: true });
        }
    },
};
let activeExtractor = exports.ffmpegFrameExtractor;
function setFrameExtractor(extractor) {
    activeExtractor = extractor;
}
/**
 * VALIDATING → QUEUED: plans 10-minute segments and enqueues one extraction task each.
 * Called after the video leaves quarantine and for retries; ignored for jobs in other states.
 */
async function startMatchPipeline(db, jobId, dispatcher = (0, taskDispatcher_1.getTaskDispatcher)()) {
    const jobRef = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId);
    const planned = await db.runTransaction(async (tx) => {
        const snap = await tx.get(jobRef);
        if (!snap.exists)
            return null;
        const job = snap.data();
        const state = (0, frameAnalysis_1.pipelineStateOf)(job);
        if (job.cancelRequested || !job.videoStoragePath || !(0, stateMachine_1.canTransitionPipeline)(state, 'queued') || state === 'queued') {
            return null;
        }
        const duration = job.measuredDurationSec ?? job.durationSec ?? 0;
        const plans = (0, segments_1.planSegments)(duration);
        if (plans.length === 0)
            return null;
        const generation = (job.pipelineGeneration ?? 0) + 1;
        const now = new Date().toISOString();
        const segments = plans.map((plan) => ({ ...plan, state: 'pending', frameCount: 0, attempts: 0, error: null }));
        tx.update(jobRef, {
            status: 'queued',
            pipelineState: 'queued',
            pipelineGeneration: generation,
            extractionSegments: segments,
            frames: [],
            attempts: 0,
            lease: null,
            error: null,
            errorCode: null,
            pipelineStages: (0, stages_1.updateStage)((0, stages_1.initialStages)(), 'video-ingestion', 'complete', now),
            queuedAt: now,
            updatedAt: now,
        });
        return { generation, segments };
    });
    if (!planned)
        return 'skipped';
    try {
        for (const segment of planned.segments) {
            await dispatcher.enqueue({ kind: 'extract_segment', jobId, generation: planned.generation, segmentIndex: segment.index });
        }
        return 'queued';
    }
    catch (error) {
        firebase_functions_1.logger.error('Could not enqueue analysis tasks', { jobId, ...(0, redact_1.logSafeError)(error) });
        await (0, frameAnalysis_1.failJob)(db, jobId, 'queue_unavailable');
        return 'failed';
    }
}
async function claimSegment(db, task) {
    const jobRef = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(task.jobId);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(jobRef);
        if (!snap.exists)
            return { kind: 'skip' };
        const job = snap.data();
        if (job.pipelineGeneration !== task.generation)
            return { kind: 'skip' };
        const now = new Date().toISOString();
        if (job.cancelRequested) {
            if (job.status !== 'cancelled')
                tx.update(jobRef, { status: 'cancelled', pipelineState: 'cancelled', updatedAt: now });
            return { kind: 'skip' };
        }
        const state = (0, frameAnalysis_1.pipelineStateOf)(job);
        let stages = (0, stages_1.parseStages)(job.pipelineStages);
        if (state === 'queued') {
            const plan = await (0, quotaService_1.planFor)(db, job.playerId, tx);
            const active = await tx.get(db.collection(frameAnalysis_1.MATCH_COLLECTION)
                .where('playerId', '==', job.playerId)
                .where('pipelineState', 'in', ['extracting', 'analyzing']));
            if (active.docs.filter((doc) => doc.id !== task.jobId).length >= plan.maxConcurrentJobs)
                return { kind: 'deferred' };
            stages = (0, stages_1.updateStage)(stages, 'frame-extraction', 'active', now);
        }
        else if (state !== 'extracting') {
            return { kind: 'skip' };
        }
        const segments = [...(job.extractionSegments ?? [])];
        const segment = segments[task.segmentIndex];
        if (!segment || segment.state === 'complete' || segment.state === 'failed')
            return { kind: 'skip' };
        const running = { ...segment, state: 'running', attempts: segment.attempts + 1, error: null };
        segments[task.segmentIndex] = running;
        tx.update(jobRef, {
            status: 'processing',
            pipelineState: 'extracting',
            extractionSegments: segments,
            pipelineStages: stages,
            updatedAt: now,
        });
        return { kind: 'run', job, segment: running };
    });
}
/**
 * Records a segment outcome. When every segment is settled the job moves to ANALYZING (enough
 * frames) or FAILED (extraction_failed); returns true when the analysis task should be queued.
 */
async function settleSegment(db, task, outcome) {
    const jobRef = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(task.jobId);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(jobRef);
        if (!snap.exists)
            return { kind: 'none' };
        const job = snap.data();
        if (job.pipelineGeneration !== task.generation || (0, frameAnalysis_1.pipelineStateOf)(job) !== 'extracting')
            return { kind: 'none' };
        const segments = [...(job.extractionSegments ?? [])];
        const segment = segments[task.segmentIndex];
        if (!segment)
            return { kind: 'none' };
        const now = new Date().toISOString();
        let frames = Array.isArray(job.frames) ? job.frames : [];
        if (outcome.state === 'complete') {
            const low = (0, segments_1.frameIndexFor)(task.segmentIndex, 0);
            frames = [...frames.filter((frame) => frame.index < low || frame.index >= low + 100), ...outcome.frames]
                .sort((a, b) => a.timestampSec - b.timestampSec);
            segments[task.segmentIndex] = { ...segment, state: 'complete', frameCount: outcome.frames.length, error: null };
        }
        else {
            segments[task.segmentIndex] = { ...segment, state: outcome.state, error: outcome.error };
        }
        const update = { extractionSegments: segments, frames, updatedAt: now };
        let next = { kind: 'none' };
        if ((0, segments_1.segmentsSettled)(segments)) {
            const stages = (0, stages_1.parseStages)(job.pipelineStages);
            if (frames.length >= frameAnalysis_1.MIN_ANALYSIS_FRAMES) {
                update.pipelineState = 'analyzing';
                update.pipelineStages = (0, stages_1.updateStage)(stages, 'frame-extraction', 'complete', now);
                const withFrames = segments.filter((item) => item.state === 'complete' && item.frameCount > 0).map((item) => item.index);
                if (withFrames.length >= 2) {
                    update.segmentReview = { total: withFrames.length, reviewed: [], failed: [] };
                    next = { kind: 'review', segmentIndexes: withFrames };
                }
                else {
                    next = { kind: 'analyze' };
                }
            }
            else {
                update.status = 'failed';
                update.pipelineState = 'failed';
                update.errorCode = 'extraction_failed';
                update.error = 'Key frames could not be extracted from this video.';
                update.pipelineStages = (0, stages_1.updateStage)(stages, 'frame-extraction', 'failed', now, { retryable: true });
            }
        }
        tx.update(jobRef, update);
        return next;
    });
}
async function enqueueNext(dispatcher, task, next) {
    if (next.kind === 'analyze') {
        await dispatcher.enqueue({ kind: 'analyze_frames', jobId: task.jobId, generation: task.generation });
    }
    else if (next.kind === 'review') {
        for (const segmentIndex of next.segmentIndexes) {
            await dispatcher.enqueue({ kind: 'review_segment', jobId: task.jobId, generation: task.generation, segmentIndex });
        }
    }
}
/** Frames extracted while the job was cancelled or already cleaned up must not linger. */
async function discardIfAbandoned(db, jobId, frames) {
    const snap = await db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).get();
    const abandoned = !snap.exists || snap.get('cancelRequested') === true || snap.get('mediaCleanupState') === 'done';
    if (!abandoned)
        return;
    const bucket = (0, storage_1.getStorage)().bucket();
    await Promise.all(frames.map((frame) => bucket.file(frame.storagePath).delete({ ignoreNotFound: true })));
}
async function processExtractTask(db, task, options) {
    const dispatcher = options.dispatcher ?? (0, taskDispatcher_1.getTaskDispatcher)();
    const claim = await claimSegment(db, task);
    if (claim.kind === 'skip')
        return 'skipped';
    if (claim.kind === 'deferred') {
        await dispatcher.enqueue(task, { delaySeconds: exports.CONCURRENCY_RETRY_DELAY_SEC });
        return 'deferred';
    }
    let next;
    try {
        const frames = await (options.extractor ?? activeExtractor).extract({
            uid: claim.job.playerId,
            jobId: task.jobId,
            videoPath: claim.job.videoStoragePath ?? '',
            segment: claim.segment,
        });
        next = await settleSegment(db, task, { state: 'complete', frames });
        await discardIfAbandoned(db, task.jobId, frames);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        firebase_functions_1.logger.warn('Segment extraction failed', { jobId: task.jobId, segment: task.segmentIndex, message });
        if (!options.finalAttempt) {
            await settleSegment(db, task, { state: 'pending', error: 'retrying' });
            throw error;
        }
        // Dead letter: the segment is marked failed and the job continues with the frames it has.
        next = await settleSegment(db, task, { state: 'failed', error: 'extraction_failed' });
    }
    await enqueueNext(dispatcher, task, next);
    return 'done';
}
async function processAnalyzeTask(db, task, options) {
    const snap = await db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(task.jobId).get();
    if (!snap.exists)
        return 'skipped';
    const job = snap.data();
    if (job.pipelineGeneration !== task.generation)
        return 'skipped';
    const state = (0, frameAnalysis_1.pipelineStateOf)(job);
    const retrying = state === 'failed' && job.errorCode === 'model_unavailable';
    if (job.cancelRequested || (state !== 'analyzing' && !retrying))
        return 'skipped';
    if (!options.apiKey) {
        await (0, frameAnalysis_1.failJob)(db, task.jobId, 'model_unavailable', undefined, undefined, task.generation);
        return 'failed';
    }
    try {
        await (0, frameAnalysis_1.runFrameAnalysis)({
            db,
            uid: job.playerId,
            jobId: task.jobId,
            requestId: `task:${task.jobId}:${task.generation}`,
            apiKey: options.apiKey,
            expectedGeneration: task.generation,
        });
        return 'complete';
    }
    catch (error) {
        const transient = error instanceof https_1.HttpsError && error.code === 'unavailable';
        if (transient && !options.finalAttempt)
            throw error;
        return 'failed';
    }
}
const TASK_RETRY = { maxAttempts: exports.TASK_MAX_ATTEMPTS, minBackoffSeconds: 30, maxBackoffSeconds: 600 };
exports.extractMatchSegment = (0, tasks_1.onTaskDispatched)({
    retryConfig: TASK_RETRY,
    rateLimits: { maxConcurrentDispatches: 6 },
    memory: '2GiB',
    cpu: 2,
    timeoutSeconds: 900,
}, async (request) => {
    const task = (0, taskDispatcher_1.parseAnalysisTask)(request.data);
    if (!task || task.kind !== 'extract_segment')
        return;
    await processExtractTask((0, firestore_1.getFirestore)(), task, { finalAttempt: request.retryCount >= exports.TASK_MAX_ATTEMPTS - 1 });
});
exports.analyzeMatchFrames = (0, tasks_1.onTaskDispatched)({
    retryConfig: TASK_RETRY,
    rateLimits: { maxConcurrentDispatches: 4 },
    secrets: [openRouterApiKey],
    memory: '1GiB',
    timeoutSeconds: 300,
}, async (request) => {
    const task = (0, taskDispatcher_1.parseAnalysisTask)(request.data);
    if (!task || task.kind !== 'analyze_frames')
        return;
    await processAnalyzeTask((0, firestore_1.getFirestore)(), task, {
        finalAttempt: request.retryCount >= exports.TASK_MAX_ATTEMPTS - 1,
        apiKey: openRouterApiKey.value(),
    });
});
//# sourceMappingURL=pipeline.js.map
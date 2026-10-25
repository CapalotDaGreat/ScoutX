"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.synthesizeMatchReport = exports.reviewMatchSegment = exports.CV_EVENT_MIN_CONFIDENCE = exports.MAX_REPORT_OBSERVATIONS = void 0;
exports.processReviewTask = processReviewTask;
exports.processSynthesisTask = processSynthesisTask;
const tasks_1 = require("firebase-functions/v2/tasks");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
const consentGate_1 = require("../ai/consentGate");
const openRouter_1 = require("../ai/openRouter");
const providerConfig_1 = require("../ai/providerConfig");
const outputValidator_1 = require("../ai/outputValidator");
const mediaSource_1 = require("../uploads/mediaSource");
const coverage_1 = require("./coverage");
const cvConfig_1 = require("./cvConfig");
const cvContract_1 = require("./cvContract");
const cvWorker_1 = require("./cvWorker");
const frameAnalysis_1 = require("./frameAnalysis");
const mode_1 = require("./mode");
const reportSections_1 = require("./reportSections");
const segmentReview_1 = require("./segmentReview");
const stages_1 = require("./stages");
const technique_1 = require("./technique");
const taskDispatcher_1 = require("./taskDispatcher");
const videoConsent_1 = require("./videoConsent");
const redact_1 = require("../logging/redact");
const openRouterApiKey = (0, params_1.defineSecret)('OPENROUTER_API_KEY');
const TASK_MAX_ATTEMPTS = 3;
/** Evidence kept in a report is bounded; each item keeps exactly one owner-private frame. */
exports.MAX_REPORT_OBSERVATIONS = 60;
/** A tracked event only counts when the worker is validated and this sure of it. */
exports.CV_EVENT_MIN_CONFIDENCE = 0.7;
async function passesGates(db, job, jobId) {
    const fail = async (code) => {
        await (0, frameAnalysis_1.failJob)(db, jobId, code, undefined, undefined, job.pipelineGeneration ?? 0);
        return false;
    };
    if (!(0, providerConfig_1.isFootageProcessingApproved)())
        return fail('ai_privacy_configuration_required');
    try {
        await (0, consentGate_1.assertAiConsent)([job.playerId], db);
    }
    catch {
        return fail('ai_consent_required');
    }
    try {
        await (0, videoConsent_1.assertVideoConsent)(db, job.playerId, jobId);
    }
    catch {
        return fail('video_consent_required');
    }
    return true;
}
function segmentFrames(job, segmentIndex) {
    const low = segmentIndex * 100;
    return (job.frames ?? [])
        .filter((frame) => frame.index >= low && frame.index < low + 100 && Number.isFinite(frame.timestampSec))
        .sort((a, b) => a.timestampSec - b.timestampSec);
}
async function runCvForSegment(db, jobId, job, segmentIndex) {
    const client = (0, cvWorker_1.getCvSegmentClient)();
    const segment = job.extractionSegments?.[segmentIndex];
    if (!client || !segment || !job.videoStoragePath)
        return;
    const ref = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).collection('cvSegments').doc(String(segmentIndex));
    const existing = await ref.get();
    if (existing.exists && existing.get('generation') === (job.pipelineGeneration ?? 0) && !existing.get('failed'))
        return;
    const source = await (0, mediaSource_1.readableSourceFor)(job.videoStoragePath, 30 * 60 * 1000);
    const result = await client.analyzeSegment((0, cvContract_1.buildCvRequest)({ jobId, segment, source: { url: source.url, headers: source.headers }, targeting: (0, frameAnalysis_1.targetingMetadata)(job) }));
    await db.runTransaction(async (tx) => {
        const latest = await tx.get(db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId));
        if (!latest.exists || latest.get('cancelRequested') === true
            || latest.get('pipelineGeneration') !== job.pipelineGeneration || latest.get('pipelineState') !== 'analyzing')
            return;
        tx.set(ref, result ? { ...(0, cvContract_1.targetOnlyCvResult)(result), generation: job.pipelineGeneration ?? 0 } : { failed: true, generation: job.pipelineGeneration ?? 0 });
    });
}
/**
 * Reviews one segment's frames (and, when a validated worker is configured, its tracking
 * result). Idempotent per segment; the last settled segment queues the synthesis.
 */
async function processReviewTask(db, task, options) {
    const jobRef = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(task.jobId);
    const snap = await jobRef.get();
    if (!snap.exists)
        return 'skipped';
    const job = snap.data();
    const progress = job.segmentReview;
    if (job.pipelineGeneration !== task.generation || job.cancelRequested || (0, frameAnalysis_1.pipelineStateOf)(job) !== 'analyzing')
        return 'skipped';
    if (!progress || progress.reviewed.includes(task.segmentIndex) || progress.failed.includes(task.segmentIndex))
        return 'skipped';
    if (!(await passesGates(db, job, task.jobId)))
        return 'failed';
    if (!options.apiKey) {
        await (0, frameAnalysis_1.failJob)(db, task.jobId, 'model_unavailable', undefined, undefined, task.generation);
        return 'failed';
    }
    try {
        await runCvForSegment(db, task.jobId, job, task.segmentIndex);
    }
    catch (error) {
        firebase_functions_1.logger.warn('CV worker segment failed', { jobId: task.jobId, ...(0, redact_1.logSafeError)(error) });
    }
    const frames = segmentFrames(job, task.segmentIndex);
    const images = [];
    const samples = [];
    for (const frame of frames) {
        const dataUrl = await (0, frameAnalysis_1.readOwnedFrameAsDataUrl)(job.playerId, task.jobId, frame.storagePath);
        if (!dataUrl)
            continue;
        images.push({ type: 'image_url', image_url: { url: dataUrl } });
        samples.push({ id: frame.id || `frame_${frame.index}`, timestampSec: frame.timestampSec });
    }
    let review = null;
    if (images.length > 0) {
        const segment = job.extractionSegments?.[task.segmentIndex];
        const model = (0, providerConfig_1.resolveModel)('vision');
        const prompt = (0, segmentReview_1.buildSegmentPrompt)({
            segmentIndex: task.segmentIndex,
            startSec: segment?.startSec ?? 0,
            endSec: segment?.endSec ?? 0,
            frames: samples,
            targeting: (0, frameAnalysis_1.targetingMetadata)(job),
        });
        const result = await (0, openRouter_1.callChat)({
            apiKey: options.apiKey,
            model,
            title: 'PitchProof Segment Review',
            messages: [
                { role: 'system', content: prompt.system },
                { role: 'user', content: [{ type: 'text', text: prompt.user }, ...images] },
            ],
        });
        if (!result.ok && !options.finalAttempt) {
            throw new https_1.HttpsError('unavailable', 'Segment review is temporarily unavailable.', { reason: 'model_unavailable' });
        }
        if (result.ok) {
            try {
                review = (0, segmentReview_1.normalizeSegmentReview)({
                    raw: (0, outputValidator_1.extractJsonObject)(result.content),
                    segmentIndex: task.segmentIndex,
                    frames: samples,
                    modelId: model,
                    now: new Date().toISOString(),
                });
            }
            catch {
                firebase_functions_1.logger.warn('Segment review output was not a JSON object', { jobId: task.jobId, segment: task.segmentIndex });
            }
        }
    }
    const settled = await db.runTransaction(async (tx) => {
        const latestSnap = await tx.get(jobRef);
        const latest = latestSnap.data();
        if (!latest || latest.pipelineGeneration !== task.generation || latest.cancelRequested
            || (0, frameAnalysis_1.pipelineStateOf)(latest) !== 'analyzing' || !latest.segmentReview)
            return null;
        const current = latest.segmentReview;
        if (current.reviewed.includes(task.segmentIndex) || current.failed.includes(task.segmentIndex))
            return null;
        if (review)
            tx.set(jobRef.collection('segmentReviews').doc(String(task.segmentIndex)), { ...review, generation: task.generation });
        const next = {
            total: current.total,
            reviewed: review ? [...current.reviewed, task.segmentIndex] : current.reviewed,
            failed: review ? current.failed : [...current.failed, task.segmentIndex],
        };
        const update = { segmentReview: next, updatedAt: new Date().toISOString() };
        // Early "Is this you?": the first frames where the reviewer saw the nominated player.
        if (review && (latest.identityCandidates ?? []).length === 0) {
            const sightings = review.frameStates.filter((state) => state.targetVisible === 'yes').slice(0, 6);
            if (sightings.length > 0) {
                const times = new Map(samples.map((sample) => [sample.id, sample.timestampSec]));
                update.identityCandidates = sightings.map((state) => ({
                    frameId: state.frameId,
                    timestampSec: times.get(state.frameId) ?? 0,
                    note: 'Possible sighting of the nominated player',
                }));
            }
        }
        tx.update(jobRef, update);
        return next.reviewed.length + next.failed.length >= next.total;
    });
    if (settled === null)
        return 'skipped';
    if (settled) {
        await (options.dispatcher ?? (0, taskDispatcher_1.getTaskDispatcher)()).enqueue({ kind: 'synthesize_report', jobId: task.jobId, generation: task.generation });
    }
    return review ? 'reviewed' : 'failed';
}
function cvPossibleEvents(results) {
    const validated = (0, cvConfig_1.cvEventsValidated)();
    return results.flatMap((result) => result.events.map((event, index) => ({
        id: `cv${result.segmentIndex}_e${index + 1}`,
        type: event.type,
        frameIds: [],
        frameTimesSec: event.frameTimesSec,
        timestampSec: event.startSec,
        note: '',
        confidence: event.confidence,
        source: 'cv_worker',
        status: (validated && (0, cvContract_1.hasConfirmedEventCoverage)(result, event) && event.confidence >= exports.CV_EVENT_MIN_CONFIDENCE
            ? 'validated'
            : 'needs_review'),
    })));
}
/**
 * Builds the report from structured segment observations only (the text model never sees the
 * video). Coaching is held back until the player confirms their identity.
 */
async function processSynthesisTask(db, task, options) {
    const jobRef = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(task.jobId);
    const snap = await jobRef.get();
    if (!snap.exists)
        return 'skipped';
    const pre = snap.data();
    const state = (0, frameAnalysis_1.pipelineStateOf)(pre);
    const retrying = state === 'failed' && pre.errorCode === 'model_unavailable';
    if (pre.pipelineGeneration !== task.generation || pre.cancelRequested || (state !== 'analyzing' && !retrying))
        return 'skipped';
    const progress = pre.segmentReview;
    if (!progress || progress.reviewed.length + progress.failed.length < progress.total)
        return 'skipped';
    if (!(await passesGates(db, pre, task.jobId)))
        return 'failed';
    if (!options.apiKey) {
        await (0, frameAnalysis_1.failJob)(db, task.jobId, 'model_unavailable', undefined, undefined, task.generation);
        return 'failed';
    }
    let job;
    try {
        job = await (0, frameAnalysis_1.acquireJobLease)(db, pre.playerId, task.jobId, `task:${task.jobId}:${task.generation}:synth`, undefined, task.generation);
    }
    catch (error) {
        firebase_functions_1.logger.warn('Synthesis lease refused', { jobId: task.jobId, ...(0, redact_1.logSafeError)(error) });
        return 'failed';
    }
    const stages = (0, stages_1.parseStages)(job.pipelineStages);
    const durationSec = job.measuredDurationSec ?? job.durationSec ?? 0;
    const mode = (0, mode_1.isAnalysisMode)(job.analysisMode)
        ? job.analysisMode
        : (0, mode_1.selectAnalysisMode)(durationSec, (0, mode_1.parseIntent)(job.analysisIntent)) ?? 'FULL_MATCH';
    const reviews = (await jobRef.collection('segmentReviews').get()).docs
        .map((doc) => doc.data())
        .filter((review) => review.generation === task.generation)
        .sort((a, b) => a.segmentIndex - b.segmentIndex);
    const cvResults = (await jobRef.collection('cvSegments').get()).docs
        .map((doc) => doc.data())
        .filter((result) => !result.failed && result.generation === task.generation)
        .map((result) => {
        const segment = job.extractionSegments?.[result.segmentIndex];
        return segment ? (0, cvContract_1.parseCvSegmentResult)(result, { segmentIndex: segment.index, startSec: segment.startSec, endSec: segment.endSec }) : null;
    })
        .filter((result) => result !== null);
    const allObservations = reviews.flatMap((review) => review.observations);
    const observations = allObservations
        .sort((a, b) => (a.confidence === b.confidence ? a.timestampSec - b.timestampSec : a.confidence === 'medium' ? -1 : 1))
        .slice(0, exports.MAX_REPORT_OBSERVATIONS)
        .sort((a, b) => a.timestampSec - b.timestampSec);
    const seenFrames = reviews.flatMap((review) => review.frameStates.filter((item) => item.targetVisible === 'yes'));
    const identityConfirmed = job.identityConfirmation?.state === 'confirmed';
    let selfReported = (0, technique_1.parseSelfReportedStars)(null);
    try {
        selfReported = (0, technique_1.parseSelfReportedStars)((await db.collection('profiles').doc(job.playerId).get()).get('identity'));
    }
    catch {
        // Self-reported stars are optional context.
    }
    const reasoningModel = (0, providerConfig_1.resolveModel)('text');
    let raw = {};
    if (observations.length > 0) {
        const prompt = (0, segmentReview_1.buildSynthesisPrompt)({
            observations,
            durationSec,
            sampledFrames: (job.frames ?? []).length,
            targetSeenFrames: seenFrames.length,
            targeting: (0, frameAnalysis_1.targetingMetadata)(job),
        });
        const result = await (0, openRouter_1.callChat)({
            apiKey: options.apiKey,
            model: reasoningModel,
            title: 'PitchProof Match Synthesis',
            messages: [
                { role: 'system', content: prompt.system },
                { role: 'user', content: prompt.user },
            ],
        });
        if (!result.ok) {
            await (0, frameAnalysis_1.failJob)(db, task.jobId, 'model_unavailable', stages, 'coaching-synthesis', task.generation);
            if (!options.finalAttempt)
                throw new https_1.HttpsError('unavailable', 'Synthesis is temporarily unavailable.', { reason: 'model_unavailable' });
            return 'failed';
        }
        try {
            raw = (0, outputValidator_1.extractJsonObject)(result.content);
        }
        catch {
            await (0, frameAnalysis_1.failJob)(db, task.jobId, 'model_output_invalid', stages, 'coaching-synthesis', task.generation);
            return 'failed';
        }
    }
    const synthesis = (0, segmentReview_1.normalizeSynthesis)(raw, observations);
    const citedFrames = new Set(observations.map((item) => item.frameId));
    const technique = (0, technique_1.normalizeTechniqueAssessment)(raw.techniqueAssessment, citedFrames, identityConfirmed, selfReported);
    const possibleEvents = [
        ...reviews.flatMap((review) => review.possibleEvents).map((event) => ({ ...event, source: 'segment_review' })),
        ...cvPossibleEvents(cvResults),
    ].sort((a, b) => a.timestampSec - b.timestampSec);
    const validatedEventCount = possibleEvents.filter((event) => event.status === 'validated').length;
    const now = new Date().toISOString();
    let finalStages = (0, stages_1.updateStage)(stages, 'player-identification', 'complete', now);
    finalStages = (0, stages_1.updateStage)(finalStages, 'identity-confirmation', identityConfirmed ? 'complete' : 'pending', now);
    for (const id of ['coaching-synthesis', 'validation', 'final-report'])
        finalStages = (0, stages_1.updateStage)(finalStages, id, 'complete', now);
    if (cvResults.length > 0) {
        const allComplete = (key) => cvResults.length === progress.total
            && cvResults.every((result) => result.stages[key] === 'complete');
        finalStages = (0, stages_1.setCvStageResult)(finalStages, 'player-tracking', allComplete('tracking') ? 'complete' : 'failed', now, 'From the computer-vision worker.');
        finalStages = (0, stages_1.setCvStageResult)(finalStages, 'event-detection', allComplete('events') ? 'complete' : 'unavailable', now, validatedEventCount > 0 ? 'Validated tracker events.' : 'Tracker events are suggestions until the worker is validated.');
    }
    const sampledFrames = (job.frames ?? []).map((frame) => ({ id: frame.id || `frame_${frame.index}`, timestampSec: frame.timestampSec }));
    const coverage = (0, coverage_1.computeCoverage)({
        durationSec,
        segments: job.extractionSegments ?? [],
        sampledFrames,
        citedFrameIds: [...citedFrames],
        identityConfirmed,
        probe: job.videoProbe ?? null,
    });
    const cvVisibleSec = cvResults.reduce((sum, result) => sum + result.coverage.targetVisibleSec, 0);
    const evidence = observations.map((item) => ({
        id: item.id,
        kind: 'observation',
        label: item.label,
        detail: item.detail,
        category: item.category,
        confidence: item.confidence === 'medium' ? 0.5 : 0.3,
        timestampSec: item.timestampSec,
        source: 'segment-review',
        frameIds: [item.frameId],
    }));
    const decisionMoments = synthesis.decisionMoments;
    const report = {
        headline: synthesis.headline || (observations.length > 0 ? 'Segment review complete' : 'Not enough evidence yet'),
        strengths: identityConfirmed ? synthesis.strengths.map((item) => item.text) : [],
        improvements: identityConfirmed ? synthesis.improvements.map((item) => item.text) : [],
        coachingNotes: identityConfirmed ? synthesis.coachingNotes : '',
        opportunities: identityConfirmed ? synthesis.opportunities : [],
        decisionMoments: identityConfirmed ? decisionMoments : [],
        estimatedStats: (0, frameAnalysis_1.emptyStats)(),
        techniqueAssessment: technique,
        coverage: {
            visiblePct: cvResults.length > 0 && durationSec > 0 ? Math.round((cvVisibleSec / durationSec) * 100) : 0,
            likelyOffCameraPct: 0,
            unknownPct: cvResults.length > 0 && durationSec > 0 ? Math.max(0, 100 - Math.round((cvVisibleSec / durationSec) * 100)) : 100,
            confidenceLabel: coverage.sampledCoverage.confidenceLabel,
            note: cvResults.length > 0
                ? 'Visible time comes from the computer-vision tracker; the rest is unknown.'
                : 'Coverage is based on how many reviewed frames showed the nominated player. Time between frames is unknown without tracking.',
        },
        sampledCoverage: coverage.sampledCoverage,
        evidence,
        possibleEvents,
        eventCounts: validatedEventCount > 0
            ? Object.fromEntries([...new Set(possibleEvents.filter((event) => event.status === 'validated').map((event) => event.type))].map((type) => [
                type,
                { count: possibleEvents.filter((event) => event.status === 'validated' && event.type === type).length, provenance: 'cv_worker' },
            ]))
            : null,
        events: [],
        coachingMoments: [],
        moments: evidence.slice(0, 8).map((item) => ({ timestampSec: item.timestampSec, label: item.label, detail: item.detail })),
        segmentSummaries: reviews.map((review) => ({
            segmentIndex: review.segmentIndex,
            summary: review.summary,
            observationCount: review.observations.length,
            targetSeenFrames: review.frameStates.filter((item) => item.targetVisible === 'yes').length,
        })),
        pipelineStages: finalStages,
        segments: [],
        availability: cvResults.length > 0 ? (0, cvContract_1.reportWindowsFromCv)(cvResults, durationSec) : coverage.availability,
        confidenceDimensions: coverage.confidenceDimensions,
        analysisMode: mode,
        versions: (0, reportSections_1.buildVersions)({
            previous: job.report,
            mode,
            visionModel: reviews[0]?.modelId ?? (0, providerConfig_1.resolveModel)('vision'),
            reasoningModel: observations.length > 0 ? reasoningModel : null,
            cvWorkerVersion: cvResults[0]?.workerVersion ?? null,
        }),
        sections: (0, reportSections_1.buildSections)({
            identityConfirmed,
            targetSeenFrames: seenFrames.length,
            ratedTechniqueCount: technique.ratedCount,
            decisionMoments: identityConfirmed ? decisionMoments.length : 0,
            isGoalkeeper: (0, frameAnalysis_1.isGoalkeeperJob)(job),
            goalkeeperNotes: observations.filter((item) => item.category === 'goalkeeping').length,
            validatedEventCount,
        }),
        tacticalSummary: 'Tactical shape and off-ball movement need continuous tracking, which this report does not have.',
        confidence: null,
        methodology: 'Each part of the video was reviewed separately from extracted key frames, and the summary was written only from those frame-bound observations. Possible events are suggestions to check, never counted.',
        modelId: reviews[0]?.modelId ?? (0, providerConfig_1.resolveModel)('vision'),
        generatedAt: now,
    };
    const pendingCoaching = identityConfirmed || observations.length === 0
        ? null
        : {
            strengths: synthesis.strengths.map((item) => item.text),
            improvements: synthesis.improvements.map((item) => item.text),
            coachingNotes: synthesis.coachingNotes,
            techniqueAssessment: (0, technique_1.normalizeTechniqueAssessment)(raw.techniqueAssessment, citedFrames, true, selfReported),
            opportunities: synthesis.opportunities,
            decisionMoments,
            clipCoaching: null,
        };
    try {
        await (0, frameAnalysis_1.finishJob)(db, task.jobId, { report, stages: finalStages, pendingCoaching, now, expectedGeneration: task.generation });
    }
    catch (error) {
        if (error instanceof https_1.HttpsError && error.code === 'aborted')
            return 'skipped';
        throw error;
    }
    return 'complete';
}
const TASK_RETRY = { maxAttempts: TASK_MAX_ATTEMPTS, minBackoffSeconds: 30, maxBackoffSeconds: 600 };
exports.reviewMatchSegment = (0, tasks_1.onTaskDispatched)({
    retryConfig: TASK_RETRY,
    rateLimits: { maxConcurrentDispatches: 6 },
    secrets: [openRouterApiKey],
    memory: '1GiB',
    timeoutSeconds: 900,
}, async (request) => {
    const task = (0, taskDispatcher_1.parseAnalysisTask)(request.data);
    if (!task || task.kind !== 'review_segment')
        return;
    await processReviewTask((0, firestore_1.getFirestore)(), task, {
        finalAttempt: request.retryCount >= TASK_MAX_ATTEMPTS - 1,
        apiKey: openRouterApiKey.value(),
    });
});
exports.synthesizeMatchReport = (0, tasks_1.onTaskDispatched)({
    retryConfig: TASK_RETRY,
    rateLimits: { maxConcurrentDispatches: 4 },
    secrets: [openRouterApiKey],
    memory: '1GiB',
    timeoutSeconds: 300,
}, async (request) => {
    const task = (0, taskDispatcher_1.parseAnalysisTask)(request.data);
    if (!task || task.kind !== 'synthesize_report')
        return;
    await processSynthesisTask((0, firestore_1.getFirestore)(), task, {
        finalAttempt: request.retryCount >= TASK_MAX_ATTEMPTS - 1,
        apiKey: openRouterApiKey.value(),
    });
});
//# sourceMappingURL=segmentPipeline.js.map
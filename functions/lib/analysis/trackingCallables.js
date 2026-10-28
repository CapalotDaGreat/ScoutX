"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshTrackingOcrTask = exports.resolveTrackingTask = exports.cloudTasksFollowUpEnqueue = exports.storageImageStore = exports.setTrackingPeriods = exports.undoTrackingAnswer = exports.answerTrackingQuestion = void 0;
exports.httpTrackingClient = httpTrackingClient;
exports.processResolveTask = processResolveTask;
exports.processOcrFollowUpTask = processOcrFollowUpTask;
exports.settleOrchestratedResolve = settleOrchestratedResolve;
const firestore_1 = require("firebase-admin/firestore");
const functions_1 = require("firebase-admin/functions");
const storage_1 = require("firebase-admin/storage");
const https_1 = require("firebase-functions/v2/https");
const tasks_1 = require("firebase-functions/v2/tasks");
const callableOptions_1 = require("../callableOptions");
const region_1 = require("../region");
const cvConfig_1 = require("./cvConfig");
const cvWorker_1 = require("./cvWorker");
const frameAnalysis_1 = require("./frameAnalysis");
const trackingV3_1 = require("./trackingV3");
const videoConsent_1 = require("./videoConsent");
const notificationProducers_1 = require("../notificationProducers");
const trackingProgress_1 = require("./trackingProgress");
const trackingFollowUp_1 = require("./trackingFollowUp");
const rateLimit_1 = require("../security/rateLimit");
const OP_ID = /^[A-Za-z0-9_-]{8,64}$/;
const JOB_ID = /^[A-Za-z0-9_-]{1,80}$/;
async function ownedJob(tx, db, jobId, uid) {
    const ref = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId);
    const snap = await tx.get(ref);
    const consent = await tx.get(db.collection(videoConsent_1.VIDEO_CONSENT_COLLECTION).doc(jobId));
    if (!snap.exists)
        throw new https_1.HttpsError('not-found', 'Analysis not found.');
    const job = snap.data();
    if (job.playerId !== uid)
        throw new https_1.HttpsError('permission-denied', 'Only the owner can review this analysis.');
    if (!consent.exists || consent.get('uid') !== uid || consent.get('revokedAt') !== null
        || consent.get('policyVersion') !== videoConsent_1.VIDEO_CONSENT_VERSION) {
        throw new https_1.HttpsError('failed-precondition', 'Current video consent is required.');
    }
    return job;
}
/**
 * Stores the change, invalidates the current report (dependent statistics are stale immediately)
 * and schedules a re-resolve. Answers only affect this match; they are not training data.
 */
async function mutateFeedback(uid, jobId, change) {
    if (!JOB_ID.test(jobId))
        throw new https_1.HttpsError('invalid-argument', 'Invalid analysis.');
    const db = (0, firestore_1.getFirestore)();
    const base = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).collection(trackingV3_1.TRACKING_COLLECTION);
    const result = await db.runTransaction(async (tx) => {
        const job = await ownedJob(tx, db, jobId, uid);
        const curSnap = await tx.get(base.doc('current'));
        const fbSnap = await tx.get(base.doc('feedback'));
        if (!curSnap.exists)
            throw new https_1.HttpsError('failed-precondition', 'No tracking report yet.');
        const cur = curSnap.data();
        const fb = (fbSnap.exists ? fbSnap.data() : { ...(0, trackingV3_1.emptyFeedback)(), revision: 0 });
        const next = change(fb, cur, job);
        const revision = (fb.revision ?? 0) + 1;
        const pending = (0, trackingV3_1.trackingV3Enabled)() && (0, cvConfig_1.cvWorkerStatus)() === 'available' ? null : 'worker_unavailable';
        tx.set(base.doc('feedback'), { ...next, revision, purpose: 'this_match_only' });
        tx.set(base.doc('current'), { stale: true, feedbackRevision: revision, pendingReason: pending,
            updatedAt: new Date().toISOString() }, { merge: true });
        return { revision, pending };
    });
    if (!result.pending) {
        await (0, functions_1.getFunctions)().taskQueue((0, region_1.taskQueueName)('resolveTrackingTask'))
            .enqueue({ jobId, feedbackRevision: result.revision }, { dispatchDeadlineSeconds: 900 });
    }
    return result;
}
exports.answerTrackingQuestion = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in first.');
    const d = (request.data ?? {});
    if (typeof d.jobId !== 'string' || typeof d.questionId !== 'string' || d.questionId.length > 40
        || !trackingV3_1.ANSWERS.includes(d.answer) || typeof d.operationId !== 'string' || !OP_ID.test(d.operationId)) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid answer.');
    }
    return mutateFeedback(uid, d.jobId, (fb, cur) => {
        if (!cur.report)
            throw new https_1.HttpsError('failed-precondition', 'No tracking report yet.');
        const next = (0, trackingV3_1.applyAnswer)(fb, cur.report, d.questionId, d.answer, d.operationId, new Date().toISOString());
        if (!next)
            throw new https_1.HttpsError('not-found', 'This question is no longer current.');
        return next;
    });
});
exports.undoTrackingAnswer = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in first.');
    const jobId = request.data?.jobId;
    if (typeof jobId !== 'string')
        throw new https_1.HttpsError('invalid-argument', 'Invalid analysis.');
    return mutateFeedback(uid, jobId, (fb) => (0, trackingV3_1.undoLast)(fb));
});
exports.setTrackingPeriods = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in first.');
    const d = (request.data ?? {});
    const p = (d.periods ?? {});
    if (typeof d.jobId !== 'string' || typeof p !== 'object')
        throw new https_1.HttpsError('invalid-argument', 'Invalid periods.');
    const clean = {};
    for (const k of ['kickoff', 'halftimeStart', 'secondHalfStart', 'fulltime']) {
        if (p[k] !== undefined)
            clean[k] = Number(p[k]);
    }
    return mutateFeedback(uid, d.jobId, (fb, _cur, job) => {
        const duration = job.measuredDurationSec ?? job.durationSec ?? 0;
        if (!(0, trackingV3_1.validPeriods)(clean, duration))
            throw new https_1.HttpsError('invalid-argument', 'Boundaries must be in order and inside the video.');
        return { ...fb, periods: clean };
    });
});
function httpTrackingClient(baseUrl, env = process.env, route = 'resolve', timeoutMs = 10 * 60 * 1000) {
    return async (body) => {
        const emulated = env.FUNCTIONS_EMULATOR === 'true';
        const token = emulated ? null : await (0, cvWorker_1.identityToken)(baseUrl);
        if (!emulated && !token)
            return null;
        try {
            const res = await fetch(`${baseUrl}/v3/tracking:${route}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(timeoutMs),
            });
            return res.ok ? await res.json() : null;
        }
        catch {
            return null;
        }
    };
}
const storageImageStore = async (path, jpeg) => {
    await (0, storage_1.getStorage)().bucket().file(path).save(jpeg, { contentType: 'image/jpeg', resumable: false,
        metadata: { cacheControl: 'private, max-age=3600' } });
};
exports.storageImageStore = storageImageStore;
const cloudTasksFollowUpEnqueue = async (payload, taskId) => {
    try {
        await (0, functions_1.getFunctions)().taskQueue((0, region_1.taskQueueName)('refreshTrackingOcrTask'))
            .enqueue(payload, { id: taskId, scheduleDelaySeconds: 5, dispatchDeadlineSeconds: 900 });
    }
    catch (e) {
        // ALREADY_EXISTS: this round was scheduled before (a retried publish) - nothing to do
        if (!String(e?.code ?? e).includes('already-exists'))
            throw e;
    }
};
exports.cloudTasksFollowUpEnqueue = cloudTasksFollowUpEnqueue;
/**
 * Re-solves identity from cached stage-1 artifacts + feedback. Never re-runs detection.
 * Writes the report only when it covers at least as much of the recording as the current one
 * (a preliminary report never overwrites a fuller one), then records the publication in the
 * progress document and sends the de-duplicated "first moments" / "review needed" / "ready"
 * notifications.
 */
async function processResolveTask(db, jobId, feedbackRevision, client, env = process.env, storeImage = exports.storageImageStore, opts = {}) {
    if (!client || !(0, trackingV3_1.trackingV3Enabled)(env) || (0, cvConfig_1.cvWorkerStatus)(env) !== 'available')
        return 'unavailable';
    const now = opts.now ?? (() => new Date());
    const base = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).collection(trackingV3_1.TRACKING_COLLECTION);
    const fbSnap = await base.doc('feedback').get();
    const fb = (fbSnap.exists ? fbSnap.data() : { ...(0, trackingV3_1.emptyFeedback)(), revision: 0 });
    if ((fb.revision ?? 0) !== feedbackRevision)
        return 'superseded';
    const job = (await db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).get()).data();
    if (!job || job.cancelRequested)
        return 'unavailable';
    const refresh = opts.scope === 'refresh';
    const raw = await client({
        contractVersion: 3, jobId, privacy: { retainNonTargetIdentities: false, faceRecognition: false, persistMedia: false },
        target: job.targeting ?? {}, feedback: (0, trackingV3_1.workerFeedback)(fb),
        ...(refresh ? { ocr: { mode: 'refresh', maxNewCrops: trackingFollowUp_1.OCR_FOLLOW_UP_MAX_CROPS } } : {}),
    });
    if (!raw || !raw.workerVersion || !raw.models || !(0, cvConfig_1.isApprovedWorkerOutput)({ workerVersion: raw.workerVersion, models: raw.models }, env)) {
        return 'rejected';
    }
    const report = (0, trackingV3_1.parseTrackingReport)(raw.report, raw.timeline);
    if (!report)
        return 'rejected';
    const progressSnap = await base.doc('progress').get();
    const progress = progressSnap.exists ? progressSnap.data() : null;
    const totalParts = progress?.plan.length ?? 0;
    const scope = !progress || report.analysedRange.parts >= totalParts ? 'full' : 'preliminary';
    // Review-card images: stored owner-only; a question without a valid image keeps imagePath null.
    const rawReport = raw.report;
    const rawQuestions = rawReport.reviewQuestions ?? [];
    for (let i = 0; i < report.reviewQuestions.length; i += 1) {
        const jpeg = (0, trackingV3_1.decodeReviewImage)(rawQuestions[i]?.imageJpegBase64);
        if (!jpeg)
            continue;
        const path = (0, trackingV3_1.reviewImagePath)(job.playerId, jobId, `${report.reviewQuestions[i].id}_r${feedbackRevision}`);
        await storeImage(path, jpeg);
        report.reviewQuestions[i].imagePath = path;
    }
    // Moment thumbnails: the target's own close-up crop inside the clip, owner-only.
    const momentImages = new Map((rawReport.moments ?? []).map((m) => [String(m?.id), m?.imageJpegBase64]));
    for (const m of report.moments) {
        const jpeg = (0, trackingV3_1.decodeReviewImage)(momentImages.get(m.id));
        if (!jpeg)
            continue;
        const path = (0, trackingV3_1.reviewImagePath)(job.playerId, jobId, `${m.id}_p${report.analysedRange.parts}_r${feedbackRevision}`);
        await storeImage(path, jpeg);
        m.imagePath = path;
    }
    const ref = (0, trackingV3_1.decodeReviewImage)(rawReport.referenceImageJpegBase64);
    if (ref) {
        const path = (0, trackingV3_1.reviewImagePath)(job.playerId, jobId, 'reference');
        await storeImage(path, ref);
        report.referenceImagePath = path;
    }
    const at = now().toISOString();
    let followUp = null;
    const outcome = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(base.doc('feedback'));
        const cur = await tx.get(base.doc('current'));
        if ((fresh.data()?.revision ?? 0) !== feedbackRevision)
            return 'superseded';
        const curDoc = cur.data();
        if (refresh && !(0, trackingFollowUp_1.followUpRunnable)(curDoc?.followUp, feedbackRevision, opts.followUpRound ?? -1))
            return 'stale';
        if (!(0, trackingProgress_1.shouldReplaceReport)(curDoc?.report ? { parts: curDoc.parts ?? 0, scope: curDoc.scope } : null, { parts: report.analysedRange.parts, scope })) {
            return 'stale';
        }
        // 5.2 deferred OCR: decide the follow-up from facts; per-user daily quota in the same transaction
        const quotaRef = db.collection('callableRateLimits').doc((0, rateLimit_1.rateLimitDocId)(job.playerId, trackingFollowUp_1.OCR_FOLLOW_UP_ACTION, 'day', now()));
        const quota = await tx.get(quotaRef);
        const used = quota.get('count') ?? 0;
        followUp = (0, trackingFollowUp_1.planOcrFollowUp)(opts.scope ?? 'feedback', feedbackRevision, report.ocrDeferred, curDoc?.followUp ?? null, at, refresh ? opts.followUpRound ?? null : null, used < trackingFollowUp_1.OCR_FOLLOW_UP_DAILY_LIMIT);
        const scheduledNow = followUp?.status === 'scheduled'
            && !(curDoc?.followUp?.revision === followUp.revision && curDoc?.followUp?.round === followUp.round);
        if (scheduledNow) {
            tx.set(quotaRef, { uid: job.playerId, action: trackingFollowUp_1.OCR_FOLLOW_UP_ACTION, window: 'day', bucket: at.slice(0, 10), count: used + 1,
                updatedAt: at }, { merge: true });
        }
        tx.set(base.doc('current'), { report, version: (curDoc?.version ?? 0) + 1, scope, parts: report.analysedRange.parts,
            stale: false, pendingReason: null, feedbackRevision, updatedAt: at, followUp });
        if (progress) {
            const published = { scope, parts: report.analysedRange.parts, analysedEndSec: report.analysedRange.endSec,
                moments: report.moments.length, reviewQuestions: report.reviewQuestions.length, at };
            tx.set(base.doc('progress'), { [scope]: published, resolving: null, updatedAt: at }, { merge: true });
        }
        return 'done';
    });
    const fu = followUp;
    if (outcome === 'done' && fu && fu.status === 'scheduled') {
        await (opts.enqueueFollowUp ?? exports.cloudTasksFollowUpEnqueue)({ jobId, feedbackRevision, round: fu.round }, (0, trackingFollowUp_1.followUpTaskId)(jobId, feedbackRevision, fu.round));
    }
    if (outcome !== 'done' || !progress || refresh)
        return outcome;
    const notify = opts.notify ?? ((id, input) => (0, notificationProducers_1.writeSystemActivity)(db, id, input));
    const ref_ = { entityType: 'match_analysis', entityId: jobId, label: 'Match analysis' };
    const gen = progress.generation;
    if (report.moments.some((m) => !m.candidate)) {
        await notify((0, trackingProgress_1.notificationId)('first_moments', jobId, gen), { recipientId: job.playerId, recipientRole: 'player',
            type: 'analysis_first_moments', category: 'analysis', title: 'Your first moments are ready',
            body: scope === 'full' ? 'Your match moments are ready to watch.' : 'Watch your first moments while the rest of the match is analysed.',
            reference: ref_ });
    }
    if ((0, trackingProgress_1.reviewNeeded)(report)) {
        await notify((0, trackingProgress_1.notificationId)('review_needed', jobId, gen), { recipientId: job.playerId, recipientRole: 'player',
            type: 'analysis_review_needed', category: 'analysis', title: 'Is this you?',
            body: 'A few quick answers help PitchProof follow the right player.', reference: ref_ });
    }
    if (scope === 'full' && opts.scope !== 'feedback') {
        await notify((0, trackingProgress_1.notificationId)('ready', jobId, gen), { recipientId: job.playerId, recipientRole: 'player',
            type: 'analysis_completed', category: 'analysis', title: 'Your match review is ready',
            body: 'Your full match review is ready. Open it to see your moments and next steps.', reference: ref_ });
    }
    return outcome;
}
exports.resolveTrackingTask = (0, tasks_1.onTaskDispatched)({ retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 }, rateLimits: { maxConcurrentDispatches: 4 }, timeoutSeconds: 900 }, async (request) => {
    const d = request.data;
    if (typeof d.jobId !== 'string' || !JOB_ID.test(d.jobId) || !Number.isSafeInteger(d.feedbackRevision))
        return;
    const scope = d.scope === 'preliminary' || d.scope === 'full' ? d.scope : 'feedback';
    const url = (0, cvConfig_1.cvWorkerUrl)();
    const db = (0, firestore_1.getFirestore)();
    let fbRevision = d.feedbackRevision;
    if (scope !== 'feedback') {
        // Orchestrated resolves always use the latest answers.
        const fb = await db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(d.jobId).collection(trackingV3_1.TRACKING_COLLECTION).doc('feedback').get();
        fbRevision = fb.data()?.revision ?? 0;
    }
    const outcome = await processResolveTask(db, d.jobId, fbRevision, url ? httpTrackingClient(url) : null, process.env, exports.storageImageStore, { scope });
    if (scope !== 'feedback')
        await settleOrchestratedResolve(db, d.jobId, scope, outcome);
});
/**
 * 5.2 deferred-OCR follow-up round: runs only if it is still the current round of the current
 * feedback revision (duplicates and stale tasks do nothing), publishes a newer report version
 * through the normal guarded path and records the outcome. Never loops: the next round is only
 * scheduled by processResolveTask when this one made progress (trackingFollowUp.ts).
 */
async function processOcrFollowUpTask(db, jobId, feedbackRevision, round, client, env = process.env, storeImage = exports.storageImageStore, opts = {}) {
    const now = opts.now ?? (() => new Date());
    const ref = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).collection(trackingV3_1.TRACKING_COLLECTION).doc('current');
    const claimed = await db.runTransaction(async (tx) => {
        const cur = await tx.get(ref);
        const f = cur.data()?.followUp ?? null;
        if (!(0, trackingFollowUp_1.followUpRunnable)(f, feedbackRevision, round))
            return false;
        tx.set(ref, { followUp: { ...f, status: 'running', updatedAt: now().toISOString() } }, { merge: true });
        return true;
    });
    if (!claimed)
        return 'stale';
    const outcome = await processResolveTask(db, jobId, feedbackRevision, client, env, storeImage, { ...opts, scope: 'refresh', followUpRound: round });
    if (outcome !== 'done') {
        const job = (await db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).get()).data();
        const status = outcome === 'superseded' || outcome === 'stale' ? 'stale' : job?.cancelRequested ? 'cancelled' : 'failed';
        await db.runTransaction(async (tx) => {
            const cur = await tx.get(ref);
            const f = cur.data()?.followUp ?? null;
            if (f && f.revision === feedbackRevision && f.round === round && ['scheduled', 'running'].includes(f.status)) {
                tx.set(ref, { followUp: { ...f, status, updatedAt: now().toISOString() } }, { merge: true });
            }
        });
    }
    return outcome;
}
exports.refreshTrackingOcrTask = (0, tasks_1.onTaskDispatched)({ retryConfig: { maxAttempts: 2, minBackoffSeconds: 60 }, rateLimits: { maxConcurrentDispatches: 2 }, timeoutSeconds: 900 }, async (request) => {
    const d = request.data;
    if (typeof d.jobId !== 'string' || !JOB_ID.test(d.jobId) || !Number.isSafeInteger(d.feedbackRevision)
        || !Number.isSafeInteger(d.round) || d.round < 1)
        return;
    const url = (0, cvConfig_1.cvWorkerUrl)();
    await processOcrFollowUpTask((0, firestore_1.getFirestore)(), d.jobId, d.feedbackRevision, d.round, url ? httpTrackingClient(url) : null);
});
/**
 * Releases the "resolving" slot after an orchestrated resolve that did not publish, so later
 * segments can schedule another one. A full report that cannot be built interrupts the analysis
 * (the owner can resume; cached segments are kept).
 */
async function settleOrchestratedResolve(db, jobId, scope, outcome, now = new Date()) {
    if (outcome === 'done')
        return;
    const ref = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).collection(trackingV3_1.TRACKING_COLLECTION).doc('progress');
    const failed = scope === 'full' && (outcome === 'rejected' || outcome === 'unavailable');
    await ref.set({ resolving: null, updatedAt: now.toISOString(), ...(failed ? { outcome: 'interrupted' } : {}) }, { merge: true });
}
//# sourceMappingURL=trackingCallables.js.map
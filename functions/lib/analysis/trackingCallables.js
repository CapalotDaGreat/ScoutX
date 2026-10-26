"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTrackingTask = exports.storageImageStore = exports.setTrackingPeriods = exports.undoTrackingAnswer = exports.answerTrackingQuestion = void 0;
exports.httpTrackingClient = httpTrackingClient;
exports.processResolveTask = processResolveTask;
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
function httpTrackingClient(baseUrl, env = process.env) {
    return async (body) => {
        const emulated = env.FUNCTIONS_EMULATOR === 'true';
        const token = emulated ? null : await (0, cvWorker_1.identityToken)(baseUrl);
        if (!emulated && !token)
            return null;
        try {
            const res = await fetch(`${baseUrl}/v3/tracking:resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(10 * 60 * 1000),
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
/** Re-solves identity from cached stage-1 artifacts + feedback. Never re-runs detection. */
async function processResolveTask(db, jobId, feedbackRevision, client, env = process.env, storeImage = exports.storageImageStore) {
    if (!client || !(0, trackingV3_1.trackingV3Enabled)(env) || (0, cvConfig_1.cvWorkerStatus)(env) !== 'available')
        return 'unavailable';
    const base = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).collection(trackingV3_1.TRACKING_COLLECTION);
    const fbSnap = await base.doc('feedback').get();
    const fb = (fbSnap.exists ? fbSnap.data() : { ...(0, trackingV3_1.emptyFeedback)(), revision: 0 });
    if ((fb.revision ?? 0) !== feedbackRevision)
        return 'superseded';
    const job = (await db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).get()).data();
    if (!job || job.cancelRequested)
        return 'unavailable';
    const raw = await client({
        contractVersion: 3, jobId, privacy: { retainNonTargetIdentities: false, faceRecognition: false, persistMedia: false },
        target: job.targeting ?? {}, feedback: (0, trackingV3_1.workerFeedback)(fb),
    });
    if (!raw || !raw.workerVersion || !raw.models || !(0, cvConfig_1.isApprovedWorkerOutput)({ workerVersion: raw.workerVersion, models: raw.models }, env)) {
        return 'rejected';
    }
    const report = (0, trackingV3_1.parseTrackingReport)(raw.report, raw.timeline);
    if (!report)
        return 'rejected';
    // Review-card images: stored owner-only; a question without a valid image keeps imagePath null.
    const rawQuestions = raw.report.reviewQuestions ?? [];
    for (let i = 0; i < report.reviewQuestions.length; i += 1) {
        const jpeg = (0, trackingV3_1.decodeReviewImage)(rawQuestions[i]?.imageJpegBase64);
        if (!jpeg)
            continue;
        const path = (0, trackingV3_1.reviewImagePath)(job.playerId, jobId, `${report.reviewQuestions[i].id}_r${feedbackRevision}`);
        await storeImage(path, jpeg);
        report.reviewQuestions[i].imagePath = path;
    }
    const ref = (0, trackingV3_1.decodeReviewImage)(raw.report.referenceImageJpegBase64);
    if (ref) {
        const path = (0, trackingV3_1.reviewImagePath)(job.playerId, jobId, 'reference');
        await storeImage(path, ref);
        report.referenceImagePath = path;
    }
    return db.runTransaction(async (tx) => {
        const fresh = await tx.get(base.doc('feedback'));
        const cur = await tx.get(base.doc('current'));
        if ((fresh.data()?.revision ?? 0) !== feedbackRevision)
            return 'superseded';
        tx.set(base.doc('current'), { report, version: (cur.data()?.version ?? 0) + 1,
            stale: false, pendingReason: null, feedbackRevision, updatedAt: new Date().toISOString() });
        return 'done';
    });
}
exports.resolveTrackingTask = (0, tasks_1.onTaskDispatched)({ retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 }, rateLimits: { maxConcurrentDispatches: 4 }, timeoutSeconds: 900 }, async (request) => {
    const d = request.data;
    if (typeof d.jobId !== 'string' || !JOB_ID.test(d.jobId) || !Number.isSafeInteger(d.feedbackRevision))
        return;
    const url = (0, cvConfig_1.cvWorkerUrl)();
    await processResolveTask((0, firestore_1.getFirestore)(), d.jobId, d.feedbackRevision, url ? httpTrackingClient(url) : null);
});
//# sourceMappingURL=trackingCallables.js.map
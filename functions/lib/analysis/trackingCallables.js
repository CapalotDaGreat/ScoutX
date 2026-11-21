"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshTrackingOcrTask = exports.resolveTrackingTask = exports.RESOLVE_LEASE_MS = exports.cloudTasksFollowUpEnqueue = exports.storageImageStore = exports.setTrackingPeriods = exports.undoTrackingAnswer = exports.answerTrackingQuestion = void 0;
exports.markTrackingFailed = markTrackingFailed;
exports.httpTrackingClient = httpTrackingClient;
exports.readWorker = readWorker;
exports.imageBucketFor = imageBucketFor;
exports.processResolveTask = processResolveTask;
exports.processOcrFollowUpTask = processOcrFollowUpTask;
exports.settleOrchestratedResolve = settleOrchestratedResolve;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const functions_1 = require("firebase-admin/functions");
const storage_1 = require("firebase-admin/storage");
const https_1 = require("firebase-functions/v2/https");
const tasks_1 = require("firebase-functions/v2/tasks");
const callableOptions_1 = require("../callableOptions");
const region_1 = require("../region");
const cvConfig_1 = require("./cvConfig");
const pilotGate_1 = require("./pilotGate");
const trackingImages_1 = require("./trackingImages");
const cvWorker_1 = require("./cvWorker");
const frameAnalysis_1 = require("./frameAnalysis");
const trackingV3_1 = require("./trackingV3");
const videoConsent_1 = require("./videoConsent");
const notificationProducers_1 = require("../notificationProducers");
const trackingProgress_1 = require("./trackingProgress");
const trackingFollowUp_1 = require("./trackingFollowUp");
const rateLimit_1 = require("../security/rateLimit");
const trackingDeadlines_1 = require("./trackingDeadlines");
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
        const cur = (0, trackingV3_1.fromStoredForm)(curSnap.data());
        const fb = (fbSnap.exists ? fbSnap.data() : { ...(0, trackingV3_1.emptyFeedback)(), revision: 0 });
        const next = change(fb, cur, job);
        const revision = (fb.revision ?? 0) + 1;
        // A contained (withheld) report stays withheld: an owner correction must not turn it into "updating".
        const pending = cur.pendingReason === 'withheld_for_review' ? 'withheld_for_review'
            : (0, trackingV3_1.trackingV3Enabled)() && (0, cvConfig_1.cvWorkerStatus)() === 'available' ? null : 'worker_unavailable';
        tx.set(base.doc('feedback'), { ...next, revision, purpose: 'this_match_only' });
        tx.set(base.doc('current'), { stale: true, feedbackRevision: revision, pendingReason: pending,
            updatedAt: new Date().toISOString() }, { merge: true });
        return { revision, pending };
    });
    if (!result.pending || result.pending === 'withheld_for_review') {
        await (0, functions_1.getFunctions)().taskQueue((0, region_1.taskQueueName)('resolveTrackingTask'))
            .enqueue({ jobId, feedbackRevision: result.revision }, { dispatchDeadlineSeconds: trackingDeadlines_1.TRACKING_TASK_TIMEOUT_SEC });
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
/** A stored full report of this feedback revision produced under this run authorisation. */
function sameRun(d, feedbackRevision, runAuth) {
    return Boolean(d && d.report && d.scope === 'full' && d.feedbackRevision === feedbackRevision && d.runAuthorizedAt === runAuth);
}
async function fullReportExists(base, heldRef, feedbackRevision, runAuth) {
    const [cur, held] = await Promise.all([base.doc('current').get(), heldRef.get()]);
    return sameRun(cur.data(), feedbackRevision, runAuth) || (!held.get('withheldAt') && sameRun(held.data(), feedbackRevision, runAuth));
}
/** R1: tracking run state on the job document (server-only field; drives the media lifecycle). */
async function markTrackingFailed(db, jobId, now = new Date()) {
    const ref = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        // A finished run stays finished: a late failure of a duplicate task must not reopen the retry window.
        if (!snap.exists || snap.get('trackingState') === 'complete')
            return;
        tx.set(ref, { trackingState: 'failed', trackingFailedAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
    });
}
function httpTrackingClient(baseUrl, env = process.env, route = 'resolve', timeoutMs = trackingDeadlines_1.TRACKING_WORKER_CLIENT_MS) {
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
        catch (error) {
            // A deadline is retryable. Any other failure stays a null response, which resolve records
            // as rejected and does not retry (a 500 is not the same as a slow match).
            if ((0, trackingDeadlines_1.isWorkerTimeout)(error))
                throw new trackingDeadlines_1.TrackingWorkerTimeout();
            return null;
        }
    };
}
/** Discovery and extraction already retry a null response. A client deadline is that same failure. */
async function readWorker(client, body) {
    try {
        return await client(body);
    }
    catch (error) {
        if (error instanceof trackingDeadlines_1.TrackingWorkerTimeout)
            return null;
        throw error;
    }
}
/** Writes the server-only held twin of a review image (R2, trackingImages.ts); the owner path is filled on release. */
const storageImageStore = async (path, jpeg) => {
    await (0, storage_1.getStorage)().bucket().file((0, trackingImages_1.heldImagePath)(path)).save(jpeg, { contentType: 'image/jpeg', resumable: false,
        metadata: { cacheControl: 'private, max-age=3600' } });
};
exports.storageImageStore = storageImageStore;
/** Image moves run against Storage only on the production path (tests inject their own store and bucket). */
function imageBucketFor(storeImage, images) {
    return images !== undefined ? images : storeImage === exports.storageImageStore ? trackingImages_1.storageImageBucket : null;
}
const cloudTasksFollowUpEnqueue = async (payload, taskId) => {
    try {
        await (0, functions_1.getFunctions)().taskQueue((0, region_1.taskQueueName)('refreshTrackingOcrTask'))
            .enqueue(payload, { id: taskId, scheduleDelaySeconds: 5, dispatchDeadlineSeconds: trackingDeadlines_1.TRACKING_TASK_TIMEOUT_SEC });
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
    // Pilot gate (pilotGate.ts): checked before the worker call and again inside the publishing transaction, including
    // the run's authorisation epoch (work authorised before the current enable never runs).
    const runAuth = (await base.doc('progress').get()).get('pilotAuthorizedAt');
    if ((await (0, pilotGate_1.pilotDecision)(db, job.playerId, env, undefined, { authorizedAt: runAuth })).decision !== 'allowed')
        return 'unavailable';
    const refresh = opts.scope === 'refresh';
    // Idempotency (2026-11-19 staging preparation): a repeated delivery of a resolve whose full report for this
    // feedback revision and run authorisation already exists (published or held) does nothing - no worker call,
    // no new version, notification or cleanup. A correction (new revision), an OCR refresh or an operator
    // re-authorisation (authorizeRun) still resolves.
    if (!refresh && runAuth && await fullReportExists(base, db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).collection(pilotGate_1.HELD_COLLECTION).doc('current'), feedbackRevision, runAuth))
        return 'stale';
    // Atomic claim before the worker call (2026-11-19): of simultaneous deliveries of the same resolve only one
    // calls the worker; the claim's token fences publication, so a claimant that was taken over cannot publish.
    const claimKey = `${feedbackRevision}|${refresh ? `refresh:${opts.followUpRound ?? -1}` : opts.scope ?? 'feedback'}|${runAuth ?? '-'}`;
    const claim = await claimResolve(db, base.doc('progress'), claimKey, opts.attempt ?? 0, now);
    // A duplicate while another delivery holds a live claim, or after it stored its report: ends without side
    // effects and without a queue retry.
    if (claim === 'busy')
        return 'busy';
    let outcome = null;
    try {
        outcome = await resolveClaimed(db, jobId, feedbackRevision, client, env, storeImage, opts, job, fb, refresh, now, base, claim);
        return outcome;
    }
    finally {
        // A stored report keeps its claim as a completion record (a later duplicate of the same key is 'busy');
        // anything else frees the key for the queue's retry.
        if (claim)
            await endResolveClaim(db, base.doc('progress'), claim, outcome === 'done' || outcome === 'held', now);
    }
}
/** Lease of a resolve claim: longer than the resolve task timeout. */
exports.RESOLVE_LEASE_MS = trackingDeadlines_1.TRACKING_ATTEMPT_LEASE_MS;
/**
 * Takes the resolve claim for `key` unless a live claim for the same key is held by this or a later attempt
 * ('busy'). Returns the token, or null when the job has no progress document (nothing to fence against).
 */
async function claimResolve(db, progress, key, attempt, now) {
    return db.runTransaction(async (tx) => {
        const p = await tx.get(progress);
        if (!p.exists)
            return null;
        const c = p.get('resolveClaim');
        if (c && c.key === key && c.finishedAt)
            return 'busy';
        if (c && c.key === key && (c.attempt ?? 0) >= attempt && c.startedAt && now().getTime() - Date.parse(c.startedAt) < exports.RESOLVE_LEASE_MS) {
            return 'busy';
        }
        const token = `${attempt}:${(0, node_crypto_1.randomUUID)()}`;
        tx.set(progress, { resolveClaim: { key, attempt, startedAt: now().toISOString(), token, finishedAt: null } }, { merge: true });
        return token;
    });
}
async function endResolveClaim(db, progress, token, finished, now) {
    await db.runTransaction(async (tx) => {
        const p = await tx.get(progress);
        if (p.get('resolveClaim')?.token !== token)
            return; // taken over: not ours
        tx.set(progress, { resolveClaim: finished ? { finishedAt: now().toISOString() } : null }, { merge: true });
    });
}
async function resolveClaimed(db, jobId, feedbackRevision, client, env, storeImage, opts, job, fb, refresh, now, base, claimToken) {
    let raw;
    try {
        raw = await client({
            contractVersion: 3, jobId, privacy: { retainNonTargetIdentities: false, faceRecognition: false, persistMedia: false },
            target: job.targeting ?? {}, feedback: (0, trackingV3_1.workerFeedback)(fb),
            ...(refresh ? { ocr: { mode: 'refresh', maxNewCrops: trackingFollowUp_1.OCR_FOLLOW_UP_MAX_CROPS } } : {}),
        });
    }
    catch (error) {
        if (error instanceof trackingDeadlines_1.TrackingWorkerTimeout)
            return 'timedOut';
        throw error;
    }
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
    const staged = [];
    const attemptStartedMs = now().getTime();
    // Every attempt writes new object names, so a URL issued for an earlier image (signed URL or download token)
    // can never address a later one, even after withholding, reprocessing and release.
    // The random part keeps two attempts in the same millisecond (a takeover) from sharing names, so a fenced
    // claimant discarding its own images can never delete the current claimant's.
    const attempt = `${attemptStartedMs.toString(36)}${(0, node_crypto_1.randomUUID)().replace(/-/g, '').slice(0, 6)}`;
    for (let i = 0; i < report.reviewQuestions.length; i += 1) {
        const jpeg = (0, trackingV3_1.decodeReviewImage)(rawQuestions[i]?.imageJpegBase64);
        if (!jpeg)
            continue;
        const path = (0, trackingV3_1.reviewImagePath)(job.playerId, jobId, `${report.reviewQuestions[i].id}_r${feedbackRevision}_${attempt}`);
        await storeImage(path, jpeg);
        staged.push(path);
        report.reviewQuestions[i].imagePath = path;
    }
    // Moment thumbnails: the target's own close-up crop inside the clip, owner-only.
    const momentImages = new Map((rawReport.moments ?? []).map((m) => [String(m?.id), m?.imageJpegBase64]));
    for (const m of report.moments) {
        const jpeg = (0, trackingV3_1.decodeReviewImage)(momentImages.get(m.id));
        if (!jpeg)
            continue;
        const path = (0, trackingV3_1.reviewImagePath)(job.playerId, jobId, `${m.id}_p${report.analysedRange.parts}_r${feedbackRevision}_${attempt}`);
        await storeImage(path, jpeg);
        staged.push(path);
        m.imagePath = path;
    }
    const ref = (0, trackingV3_1.decodeReviewImage)(rawReport.referenceImageJpegBase64);
    if (ref) {
        const path = (0, trackingV3_1.reviewImagePath)(job.playerId, jobId, `reference_${attempt}`);
        await storeImage(path, ref);
        staged.push(path);
        report.referenceImagePath = path;
    }
    const at = now().toISOString();
    let followUp = null;
    const heldRef = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).collection(pilotGate_1.HELD_COLLECTION).doc('current');
    const outcome = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(base.doc('feedback'));
        const cur = await tx.get(base.doc('current'));
        // A result that comes back after the pilot was stopped (kill switch) or the owner was removed is discarded here.
        const progTx = await tx.get(base.doc('progress'));
        const gate = await (0, pilotGate_1.pilotDecision)(db, job.playerId, env, tx, { authorizedAt: progTx.get('pilotAuthorizedAt') });
        if (gate.decision !== 'allowed')
            return 'stopped';
        // Fenced: a claimant that was taken over (expired lease, later attempt, newer revision) publishes nothing.
        if (claimToken && progTx.get('resolveClaim')?.token !== claimToken)
            return 'stale';
        const held = gate.hold ? await tx.get(heldRef) : null;
        if ((fresh.data()?.revision ?? 0) !== feedbackRevision)
            return 'superseded';
        const curDoc = cur.data();
        if (refresh && !(0, trackingFollowUp_1.followUpRunnable)(curDoc?.followUp, feedbackRevision, opts.followUpRound ?? -1))
            return 'stale';
        // While held, only a report still awaiting review counts as "previous"; a withheld (contained) or released
        // copy must not block verified reprocessing.
        const pendingHeld = held?.exists && held.get('report') && !held.get('withheldAt') ? held.data() : undefined;
        const prevDoc = (held ? pendingHeld : curDoc);
        if (!(0, trackingProgress_1.shouldReplaceReport)(prevDoc?.report ? { parts: prevDoc.parts ?? 0, scope: prevDoc.scope } : null, { parts: report.analysedRange.parts, scope })) {
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
        // Same rule inside the transaction: of concurrent duplicate deliveries only the first one stores a report.
        const runAuthTx = progTx.get('pilotAuthorizedAt');
        if (!refresh && runAuthTx && (sameRun(cur.data(), feedbackRevision, runAuthTx)
            || sameRun(gate.hold && held?.exists && !held.get('withheldAt') ? held.data() : undefined, feedbackRevision, runAuthTx))) {
            return 'stale';
        }
        const doc = { report: (0, trackingV3_1.toStoredForm)(report), version: (prevDoc?.version ?? 0) + 1, scope, parts: report.analysedRange.parts,
            stale: false, pendingReason: null, feedbackRevision, updatedAt: at, followUp, runAuthorizedAt: runAuthTx ?? null,
            // Provenance for audits and rollback: exactly which approved worker build and models produced this report.
            producedBy: { workerVersion: raw.workerVersion, models: raw.models } };
        // R1: a full report (published or held) finishes the tracking run; the media lifecycle takes it from here.
        if (progress && scope === 'full') {
            tx.set(db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId), { trackingState: 'complete', trackingCompletedAt: at, updatedAt: at }, { merge: true });
        }
        if (held) {
            // Held for review: nothing reaches tracking/current (owner-readable) and no completion notice is sent.
            // Reprocessing a contained report keeps the containment record for audit.
            const contained = held?.exists && held.get('withheldAt')
                ? { previousWithheld: { withheldAt: held.get('withheldAt'), withheldReason: held.get('withheldReason') ?? null } } : {};
            tx.set(heldRef, { ...doc, ...contained, heldAt: at });
            if (progress)
                tx.set(base.doc('progress'), { resolving: null, held: { scope, at }, updatedAt: at }, { merge: true });
            return 'held';
        }
        tx.set(base.doc('current'), doc);
        if (progress) {
            const published = { scope, parts: report.analysedRange.parts, analysedEndSec: report.analysedRange.endSec,
                moments: report.moments.length, reviewQuestions: report.reviewQuestions.length, at };
            tx.set(base.doc('progress'), { [scope]: published, resolving: null, updatedAt: at }, { merge: true });
        }
        return 'done';
    });
    // R2: images follow the report. Published -> owner paths; held -> stay server-only; anything else discards
    // this attempt's images (and superseded images older than any attempt that could still be running).
    const images = imageBucketFor(storeImage, opts.images);
    if (images) {
        if (outcome === 'done')
            await (0, trackingImages_1.publishImages)(images, (0, trackingImages_1.referencedImagePaths)((0, trackingV3_1.toStoredForm)(report)));
        if (outcome === 'done' || outcome === 'held' || staged.length) {
            await (0, trackingImages_1.pruneJobImages)(images, job.playerId, jobId, await (0, trackingImages_1.readImageDocs)(db, frameAnalysis_1.MATCH_COLLECTION, jobId), { own: outcome === 'done' || outcome === 'held' ? [] : staged, olderThanMs: attemptStartedMs - trackingImages_1.IMAGE_ATTEMPT_MAX_MS });
        }
    }
    const fu = followUp;
    if ((outcome === 'done' || outcome === 'held') && fu && fu.status === 'scheduled') {
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
exports.resolveTrackingTask = (0, tasks_1.onTaskDispatched)({ retryConfig: { maxAttempts: trackingDeadlines_1.RESOLVE_MAX_ATTEMPTS, minBackoffSeconds: 30 }, rateLimits: { maxConcurrentDispatches: 4 },
    timeoutSeconds: trackingDeadlines_1.TRACKING_TASK_TIMEOUT_SEC }, async (request) => {
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
    const attempt = request.retryCount ?? 0;
    const outcome = await processResolveTask(db, d.jobId, fbRevision, url ? httpTrackingClient(url) : null, process.env, exports.storageImageStore, { scope, attempt });
    // Earlier attempts throw, so Cloud Tasks retries. The last attempt falls through and, for a full
    // resolve, settleOrchestratedResolve marks the job interrupted. Returning here would count as success.
    if (outcome === 'timedOut' && (0, trackingDeadlines_1.timeoutWillRetry)(attempt, trackingDeadlines_1.RESOLVE_MAX_ATTEMPTS))
        throw new trackingDeadlines_1.TrackingWorkerTimeout();
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
    if (outcome === 'timedOut' && (0, trackingDeadlines_1.timeoutWillRetry)(opts.attempt ?? 0, trackingDeadlines_1.OCR_REFRESH_MAX_ATTEMPTS)) {
        throw new trackingDeadlines_1.TrackingWorkerTimeout();
    }
    if (outcome !== 'done') {
        const job = (await db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).get()).data();
        const status = outcome === 'superseded' || outcome === 'stale' || outcome === 'busy' ? 'stale' : job?.cancelRequested ? 'cancelled' : 'failed';
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
exports.refreshTrackingOcrTask = (0, tasks_1.onTaskDispatched)({ retryConfig: { maxAttempts: trackingDeadlines_1.OCR_REFRESH_MAX_ATTEMPTS, minBackoffSeconds: 60 }, rateLimits: { maxConcurrentDispatches: 2 },
    timeoutSeconds: trackingDeadlines_1.TRACKING_TASK_TIMEOUT_SEC }, async (request) => {
    const d = request.data;
    if (typeof d.jobId !== 'string' || !JOB_ID.test(d.jobId) || !Number.isSafeInteger(d.feedbackRevision)
        || !Number.isSafeInteger(d.round) || d.round < 1)
        return;
    const url = (0, cvConfig_1.cvWorkerUrl)();
    await processOcrFollowUpTask((0, firestore_1.getFirestore)(), d.jobId, d.feedbackRevision, d.round, url ? httpTrackingClient(url) : null, process.env, exports.storageImageStore, { attempt: request.retryCount ?? 0 });
});
/**
 * Releases the "resolving" slot after an orchestrated resolve that did not publish, so later
 * segments can schedule another one. A full report that cannot be built interrupts the analysis
 * (the owner can resume; cached segments are kept).
 */
async function settleOrchestratedResolve(db, jobId, scope, outcome, now = new Date()) {
    // 'busy': another delivery holds the claim and settles the run itself.
    if (outcome === 'done' || outcome === 'held' || outcome === 'busy')
        return;
    const ref = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).collection(trackingV3_1.TRACKING_COLLECTION).doc('progress');
    const failed = scope === 'full' && (outcome === 'rejected' || outcome === 'unavailable' || outcome === 'stopped' || outcome === 'timedOut');
    await ref.set({ resolving: null, updatedAt: now.toISOString(), ...(failed ? { outcome: 'interrupted' } : {}) }, { merge: true });
    // R1: an interrupted run is resumable; the source stays for the failed-analysis retry window, then goes.
    if (failed)
        await markTrackingFailed(db, jobId, now);
}
//# sourceMappingURL=trackingCallables.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OCR_REFRESH_LEASE_MS = exports.RESOLVE_LEASE_MS = void 0;
exports.claimTrackingTask = claimTrackingTask;
exports.ownsTrackingLease = ownsTrackingLease;
exports.trackingLeaseCurrent = trackingLeaseCurrent;
exports.releaseTrackingTask = releaseTrackingTask;
const node_crypto_1 = require("node:crypto");
const frameAnalysis_1 = require("./frameAnalysis");
const trackingV3_1 = require("./trackingV3");
const trackingDeadlines_1 = require("./trackingDeadlines");
const trackingFollowUp_1 = require("./trackingFollowUp");
exports.RESOLVE_LEASE_MS = trackingDeadlines_1.TRACKING_ATTEMPT_LEASE_MS;
exports.OCR_REFRESH_LEASE_MS = trackingDeadlines_1.TRACKING_ATTEMPT_LEASE_MS;
/** One lease per scope, so a slow preliminary report cannot consume the full report's retry budget. */
async function claimTrackingTask(db, jobId, revision, scope, round, now) {
    const base = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).collection(trackingV3_1.TRACKING_COLLECTION);
    const ref = base.doc(`lease_${scope}`);
    return db.runTransaction(async (tx) => {
        const progress = await tx.get(base.doc('progress'));
        const stored = await tx.get(ref);
        const feedback = await tx.get(base.doc('feedback'));
        const job = await tx.get(db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId));
        if (!job.exists || progress.get('outcome') === 'cancelled')
            return 'unavailable';
        if (scope !== 'refresh' && (feedback.get('revision') ?? 0) !== revision)
            return 'superseded';
        if (scope === 'refresh') {
            const current = await tx.get(base.doc('current'));
            if (!(0, trackingFollowUp_1.followUpRunnable)(current.get('followUp'), revision, round ?? -1))
                return 'stale';
        }
        const generation = progress.get('generation') ?? null;
        const key = `${generation ?? '-'}:${revision}:${round ?? '-'}`;
        const at = now().getTime();
        if (stored.get('key') === key && typeof stored.get('token') === 'string'
            && Number(stored.get('expiresAtMs')) > at)
            return 'busy';
        const token = (0, node_crypto_1.randomUUID)();
        tx.set(ref, { key, token, expiresAtMs: at + trackingDeadlines_1.TRACKING_ATTEMPT_LEASE_MS });
        return { ref, token, generation, revision };
    });
}
function ownsTrackingLease(snapshot, lease, at) {
    return snapshot.get('token') === lease.token && Number(snapshot.get('expiresAtMs')) > at.getTime();
}
/** Fences against takeover/new generations. allowStopped is only for marking an old OCR chain stale/cancelled. */
async function trackingLeaseCurrent(tx, db, jobId, lease, at, allowStopped = false) {
    const stored = await tx.get(lease.ref);
    const job = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId);
    const progress = await tx.get(job.collection(trackingV3_1.TRACKING_COLLECTION).doc('progress'));
    const feedback = await tx.get(job.collection(trackingV3_1.TRACKING_COLLECTION).doc('feedback'));
    const currentJob = await tx.get(job);
    return ownsTrackingLease(stored, lease, at) && (progress.get('generation') ?? null) === lease.generation
        && (allowStopped || ((feedback.get('revision') ?? 0) === lease.revision && currentJob.exists
            && currentJob.get('cancelRequested') !== true && progress.get('outcome') !== 'cancelled'));
}
async function releaseTrackingTask(db, lease) {
    await db.runTransaction(async (tx) => {
        const stored = await tx.get(lease.ref);
        if (stored.get('token') === lease.token)
            tx.set(lease.ref, { token: null, expiresAtMs: 0 }, { merge: true });
    });
}
//# sourceMappingURL=trackingTaskLeases.js.map
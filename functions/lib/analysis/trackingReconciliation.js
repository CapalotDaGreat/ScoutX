"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconcileTrackingAttempts = exports.RECONCILIATION_BATCH_SIZE = void 0;
exports.reconcileTrackingAttempt = reconcileTrackingAttempt;
exports.sweepTrackingAttempts = sweepTrackingAttempts;
const firestore_1 = require("firebase-admin/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const frameAnalysis_1 = require("./frameAnalysis");
const trackingV3_1 = require("./trackingV3");
const trackingTaskLeases_1 = require("./trackingTaskLeases");
const trackingFollowUp_1 = require("./trackingFollowUp");
/** Server-only durable final-attempt outbox. No task enqueue, provider calls or inference. */
async function reconcileTrackingAttempt(db, id, now = new Date()) {
    const ticketRef = db.collection(trackingTaskLeases_1.RECONCILIATION_COLLECTION).doc(id);
    return db.runTransaction(async (tx) => {
        const ticket = await tx.get(ticketRef);
        if (!ticket.exists)
            return 'discarded';
        const t = ticket.data();
        if (typeof t.dueAtMs !== 'number' || !Number.isFinite(t.dueAtMs) || t.dueAtMs > now.getTime())
            return 'waiting';
        if (typeof t.jobId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(t.jobId)
            || !['full', 'preliminary', 'feedback', 'refresh'].includes(t.scope)
            || t.token !== id || !Number.isSafeInteger(t.revision)) {
            tx.delete(ticketRef);
            return 'discarded';
        }
        const jobRef = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(t.jobId);
        const base = jobRef.collection(trackingV3_1.TRACKING_COLLECTION);
        const leaseRef = base.doc(`lease_${t.scope}`);
        const [job, progress, feedback, current, lease] = await Promise.all([
            tx.get(jobRef), tx.get(base.doc('progress')), tx.get(base.doc('feedback')),
            tx.get(base.doc('current')), tx.get(leaseRef),
        ]);
        // A renewed/extended lease must be observed again later, never force-expired by this sweep.
        if (lease.get('token') === t.token && Number(lease.get('expiresAtMs')) > now.getTime()) {
            tx.set(ticketRef, { dueAtMs: Number(lease.get('expiresAtMs')) }, { merge: true });
            return 'waiting';
        }
        const same = job.exists && !job.get('cancelRequested') && progress.get('outcome') !== 'cancelled'
            && progress.get('outcome') !== 'interrupted' && lease.get('token') === t.token
            && (progress.get('generation') ?? null) === t.generation
            && (progress.get('startedAt') ?? null) === t.startedAt
            && typeof lease.get('expiresAtMs') === 'number' && Number.isFinite(lease.get('expiresAtMs'))
            && Number(lease.get('expiresAtMs')) <= now.getTime()
            && (feedback.get('revision') ?? 0) === t.revision
            && (current.get('version') ?? null) === t.currentVersion;
        let settled = false;
        const updatedAt = now.toISOString();
        if (same) {
            if (t.scope === 'refresh') {
                const followUp = current.get('followUp');
                if ((0, trackingFollowUp_1.followUpRunnable)(followUp, t.revision, t.round)) {
                    tx.set(base.doc('current'), { followUp: { ...followUp, status: 'failed', updatedAt } }, { merge: true });
                    settled = true;
                }
            }
            else if (t.scope === 'feedback') {
                if (current.exists && current.get('stale') === true && current.get('feedbackRevision') === t.revision) {
                    tx.set(base.doc('current'), { pendingReason: 'resolve_interrupted', updatedAt }, { merge: true });
                    settled = true;
                }
            }
            else if (progress.exists && progress.get('resolving') === t.scope && !progress.get('full')) {
                tx.set(base.doc('progress'), { resolving: null, updatedAt,
                    ...(t.scope === 'full' ? { outcome: 'interrupted' } : {}) }, { merge: true });
                settled = true;
            }
            // Retire only this expired token. Late publishers are already rejected at lease expiry.
            tx.set(leaseRef, { token: null, expiresAtMs: 0 }, { merge: true });
        }
        tx.delete(ticketRef);
        return settled ? 'settled' : 'discarded';
    });
}
exports.RECONCILIATION_BATCH_SIZE = 100;
/** Single indexed inequality; bounded each invocation and safe for overlapping scheduler deliveries. */
async function sweepTrackingAttempts(db, now = new Date()) {
    const due = await db.collection(trackingTaskLeases_1.RECONCILIATION_COLLECTION).where('dueAtMs', '<=', now.getTime())
        .orderBy('dueAtMs').limit(exports.RECONCILIATION_BATCH_SIZE).get();
    for (const ticket of due.docs)
        await reconcileTrackingAttempt(db, ticket.id, now);
    return due.size;
}
exports.reconcileTrackingAttempts = (0, scheduler_1.onSchedule)({ schedule: 'every 5 minutes', timeoutSeconds: 300, maxInstances: 1 }, async () => { await sweepTrackingAttempts((0, firestore_1.getFirestore)()); });
//# sourceMappingURL=trackingReconciliation.js.map
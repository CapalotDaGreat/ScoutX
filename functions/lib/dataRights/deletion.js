"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DELETION_COLLECTION = exports.DELETION_STEPS = void 0;
exports.isDeletionStep = isDeletionStep;
exports.nextDeletionStep = nextDeletionStep;
exports.runAccountDeletion = runAccountDeletion;
const firebase_functions_1 = require("firebase-functions");
const accountDeletion_1 = require("../accountDeletion");
const sessions_1 = require("../uploads/sessions");
const legalRetention_1 = require("./legalRetention");
/**
 * Account deletion as a resumable state machine in `deletionRequests/{uid}`. Each step is
 * idempotent, so a retry (or a second tap on "Delete account") continues where the last
 * attempt stopped instead of starting over.
 */
exports.DELETION_STEPS = [
    'requested',
    'access_revoked',
    'jobs_cancelled',
    'primary_deleted',
    'media_deleted',
    'derived_deleted',
    'verified',
    'completed',
];
exports.DELETION_COLLECTION = 'deletionRequests';
function isDeletionStep(value) {
    return typeof value === 'string' && exports.DELETION_STEPS.includes(value);
}
function nextDeletionStep(step) {
    const index = exports.DELETION_STEPS.indexOf(step);
    return index >= 0 && index < exports.DELETION_STEPS.length - 1 ? exports.DELETION_STEPS[index + 1] : null;
}
const ACTIVE_JOB_STATUSES = ['draft', 'uploading', 'queued', 'processing'];
async function hideAndRevoke(db, uid, deps) {
    // Stop being discoverable and reachable first, before the slower deletes.
    await Promise.all(['discoverablePlayers', 'publicPassports', 'pushTokens'].map((collection) => db.collection(collection).doc(uid).delete()));
    await deps.revokeProviderTokens(uid);
    await deps.revokeSessions(uid);
}
async function cancelActiveWork(db, uid) {
    const jobs = await db.collection('matchAnalysisJobs').where('playerId', '==', uid).get();
    const now = new Date().toISOString();
    for (const job of jobs.docs) {
        if (!ACTIVE_JOB_STATUSES.includes(String(job.get('status'))))
            continue;
        await job.ref.update({ cancelRequested: true, status: 'cancelled', pipelineState: 'cancelled', updatedAt: now });
        await (0, sessions_1.discardUploadsForJob)(db, uid, job.id);
    }
}
async function runAccountDeletion(db, uid, deps) {
    const ref = db.collection(exports.DELETION_COLLECTION).doc(uid);
    const snap = await ref.get();
    const now = new Date().toISOString();
    const requestedAt = typeof snap.get('requestedAt') === 'string' ? snap.get('requestedAt') : now;
    let step = isDeletionStep(snap.get('step')) ? snap.get('step') : 'requested';
    await ref.set({
        uid,
        step,
        status: 'in_progress',
        requestedAt,
        attempts: (typeof snap.get('attempts') === 'number' ? snap.get('attempts') : 0) + 1,
        updatedAt: now,
    }, { merge: true });
    const failures = [];
    for (let next = nextDeletionStep(step); next; next = nextDeletionStep(step)) {
        try {
            if (next === 'access_revoked')
                await hideAndRevoke(db, uid, deps);
            if (next === 'jobs_cancelled')
                await cancelActiveWork(db, uid);
            if (next === 'primary_deleted') {
                await (0, legalRetention_1.retainLegalRecords)(db, uid);
                failures.push(...(await (0, accountDeletion_1.deletePrimaryData)(uid)).failures);
            }
            if (next === 'media_deleted')
                failures.push(...(await (0, accountDeletion_1.deleteMediaData)(uid)).failures);
            if (next === 'derived_deleted')
                failures.push(...(await (0, accountDeletion_1.deleteDerivedData)(uid)).failures);
            if (next === 'verified') {
                const remaining = await (0, accountDeletion_1.verifyUserDataDeleted)(uid);
                if (remaining.length > 0) {
                    // Retry re-runs the delete steps; the earlier ones are already done.
                    await ref.set({ step: 'jobs_cancelled', status: 'failed', remaining, updatedAt: new Date().toISOString() }, { merge: true });
                    firebase_functions_1.logger.warn('Account deletion left data behind; will retry', { remaining, failures });
                    return { status: 'failed', step: 'verified', remaining };
                }
            }
            if (next === 'completed') {
                await deps.deleteAuthUser(uid);
                await (0, legalRetention_1.writeDeletionReceipt)(db, uid, { requestedAt, completedAt: new Date().toISOString(), remaining: [] });
                await ref.delete();
                return { status: 'completed' };
            }
        }
        catch (error) {
            firebase_functions_1.logger.error('Account deletion step failed', {
                step: next,
                message: error instanceof Error ? error.message : 'unknown',
            });
            await ref.set({ status: 'failed', failedStep: next, updatedAt: new Date().toISOString() }, { merge: true });
            return { status: 'failed', step: next, remaining: [] };
        }
        step = next;
        await ref.set({ step, status: 'in_progress', updatedAt: new Date().toISOString() }, { merge: true });
    }
    return { status: 'completed' };
}
//# sourceMappingURL=deletion.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHILD_EXPIRED_GRACE_DAYS = void 0;
exports.childConsentDeadline = childConsentDeadline;
exports.childDeleteAfterApproval = childDeleteAfterApproval;
exports.deleteChildAccount = deleteChildAccount;
exports.deleteUnconsentedChildAccounts = deleteUnconsentedChildAccounts;
const firebase_functions_1 = require("firebase-functions");
const appleAuth_1 = require("../appleAuth");
const deletion_1 = require("../dataRights/deletion");
const userSafety_1 = require("./userSafety");
const DAY_MS = 24 * 60 * 60 * 1000;
/** Grace period after a parent's consent expires before the private account is deleted. */
exports.CHILD_EXPIRED_GRACE_DAYS = 30;
/** When an under-13 account without parental consent is deleted. */
function childConsentDeadline(from = new Date()) {
    return new Date(from.getTime() + userSafety_1.CHILD_CONSENT_WAIT_DAYS * DAY_MS).toISOString();
}
/** Approved accounts are kept while consent is valid, plus a grace period to renew it. */
function childDeleteAfterApproval(consentExpiresAt) {
    return new Date(Date.parse(consentExpiresAt) + exports.CHILD_EXPIRED_GRACE_DAYS * DAY_MS).toISOString();
}
/**
 * Deletes a child's account because a parent declined or withdrew consent, or consent was
 * never given. Returns false if deletion stopped part-way; the daily cleanup retries it.
 */
async function deleteChildAccount(db, uid, reason, deps = appleAuth_1.accountDeletionDeps) {
    // Marks the request so the daily cleanup resumes it if a step fails after userSafety is gone.
    await db.collection(deletion_1.DELETION_COLLECTION).doc(uid).set({ uid, childAccount: true, childReason: reason }, { merge: true });
    const outcome = await (0, deletion_1.runAccountDeletion)(db, uid, deps);
    if (outcome.status === 'failed') {
        firebase_functions_1.logger.error('Child account deletion incomplete', { uid, reason, step: outcome.step });
        return false;
    }
    firebase_functions_1.logger.info('Child account deleted', { uid, reason });
    return true;
}
/**
 * Under-13 accounts whose `childDeleteAfter` has passed: parental consent was never given,
 * was declined or withdrawn, or expired and was not renewed.
 */
async function deleteUnconsentedChildAccounts(db, now = new Date(), deps = appleAuth_1.accountDeletionDeps, batch = 100) {
    const due = await db
        .collection('userSafety')
        .where('childDeleteAfter', '<=', now.toISOString())
        .limit(batch)
        .get();
    let deleted = 0;
    for (const doc of due.docs) {
        if (doc.get('ageBand') !== 'under13')
            continue;
        if (await deleteChildAccount(db, doc.id, 'no_valid_parental_consent', deps))
            deleted += 1;
    }
    const interrupted = await db
        .collection(deletion_1.DELETION_COLLECTION)
        .where('childAccount', '==', true)
        .where('status', '==', 'failed')
        .limit(batch)
        .get();
    for (const doc of interrupted.docs) {
        const reason = typeof doc.get('childReason') === 'string' ? String(doc.get('childReason')) : 'retry';
        if (await deleteChildAccount(db, doc.id, reason, deps))
            deleted += 1;
    }
    return deleted;
}
//# sourceMappingURL=childAccounts.js.map
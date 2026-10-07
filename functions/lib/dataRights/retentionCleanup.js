"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retentionCleanup = void 0;
exports.runRetentionCleanup = runRetentionCleanup;
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const firebase_functions_1 = require("firebase-functions");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const model_1 = require("../uploads/model");
const legalRetention_1 = require("./legalRetention");
const retention_1 = require("./retention");
const BATCH = 300;
async function each(query, run) {
    const snap = await query.limit(BATCH).get();
    for (const doc of snap.docs)
        await run(doc);
    return snap.size;
}
async function deletePrefix(prefix) {
    await (0, storage_1.getStorage)().bucket().deleteFiles({ prefix, force: true });
}
/**
 * Applies the retention periods in `retention.ts`. Each pass handles up to BATCH items per
 * category; the daily schedule catches up on anything left over.
 */
async function runRetentionCleanup(db, now = new Date()) {
    const nowIso = now.toISOString();
    const exportsExpired = await each(db.collection('dataExports').where('status', '==', 'ready').where('expiresAt', '<=', nowIso), async (doc) => {
        await deletePrefix(`exports/${String(doc.get('uid'))}/${doc.id}/`);
        await doc.ref.update({ status: 'expired', downloadUrl: null, storagePath: null, updatedAt: nowIso });
    }) + await each(db.collection('dataExports').where('status', 'in', ['failed', 'expired']).where('updatedAt', '<=', (0, retention_1.olderThan)(now, retention_1.RETENTION.exportDays)), async (doc) => {
        await deletePrefix(`exports/${String(doc.get('uid'))}/${doc.id}/`);
        await doc.ref.delete();
    });
    const failedUploads = await each(db.collection('mediaUploads').where('state', 'in', ['rejected', 'expired', 'cancelled']).where('updatedAt', '<=', (0, retention_1.olderThan)(now, retention_1.RETENTION.failedUploadDays)), async (doc) => {
        await deletePrefix(`quarantine/${String(doc.get('ownerId'))}/${doc.id}/`);
        await doc.ref.delete();
    });
    const abandonedJobs = await each(db.collection('matchAnalysisJobs').where('status', 'in', ['cancelled', 'expired', 'failed']).where('updatedAt', '<=', (0, retention_1.olderThan)(now, retention_1.RETENTION.abandonedJobDays)), async (doc) => {
        await deletePrefix(`profiles/${String(doc.get('playerId'))}/matchFootage/${doc.id}/`);
        await db.collection('players').doc(String(doc.get('playerId'))).collection('media').doc((0, model_1.footageMediaId)(doc.id)).delete();
        await doc.ref.delete();
    });
    const webhookReceipts = await each(db.collection('revenueCatEvents').where('processedAt', '<=', (0, retention_1.olderThan)(now, retention_1.RETENTION.webhookReceiptDays)), async (doc) => {
        await doc.ref.delete();
    });
    const legalRecords = await each(db.collection(legalRetention_1.LEGAL_RETENTION_COLLECTION).where('deleteAfter', '<=', nowIso), async (doc) => {
        await doc.ref.delete();
    });
    const privacyRequests = await each(db.collection('privacyRequests').where('status', 'in', ['completed', 'rejected']).where('closedAt', '<=', (0, retention_1.olderThan)(now, retention_1.RETENTION.privacyRequestDays)), async (doc) => {
        await doc.ref.delete();
    });
    return { exportsExpired, failedUploads, abandonedJobs, webhookReceipts, legalRecords, privacyRequests };
}
exports.retentionCleanup = (0, scheduler_1.onSchedule)({ schedule: 'every day 03:30', timeZone: 'Europe/Zurich', timeoutSeconds: 540 }, async () => {
    const counts = await runRetentionCleanup((0, firestore_1.getFirestore)());
    firebase_functions_1.logger.info('Retention cleanup finished', counts);
});
//# sourceMappingURL=retentionCleanup.js.map
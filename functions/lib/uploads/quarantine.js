"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onQuarantineObjectFinalized = void 0;
exports.recordQuarantinedObject = recordQuarantinedObject;
const storage_1 = require("firebase-functions/v2/storage");
const firestore_1 = require("firebase-admin/firestore");
const storage_2 = require("firebase-admin/storage");
const firebase_functions_1 = require("firebase-functions");
const model_1 = require("./model");
/** Marks a finished upload as quarantined; objects without a matching session are deleted. */
async function recordQuarantinedObject(db, path, sizeBytes) {
    const parsed = (0, model_1.parseQuarantinePath)(path);
    if (!parsed)
        return null;
    const ref = db.collection('mediaUploads').doc(parsed.uploadId);
    const snap = await ref.get();
    const data = snap.data();
    if (!data || data.ownerId !== parsed.uid || data.state !== 'uploading') {
        await (0, storage_2.getStorage)().bucket().file(path).delete({ ignoreNotFound: true });
        firebase_functions_1.logger.warn('Quarantine object without an open upload was deleted', { uploadId: parsed.uploadId });
        return null;
    }
    await db.collection('mediaUploadSessions').doc(parsed.uploadId).delete();
    await ref.update({
        state: 'quarantined',
        receivedBytes: sizeBytes,
        quarantinedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    });
    return 'quarantined';
}
exports.onQuarantineObjectFinalized = (0, storage_1.onObjectFinalized)({ memory: '256MiB' }, async (event) => {
    if (!event.data.name?.startsWith('quarantine/'))
        return;
    await recordQuarantinedObject((0, firestore_1.getFirestore)(), event.data.name, Number(event.data.size ?? 0));
});
//# sourceMappingURL=quarantine.js.map
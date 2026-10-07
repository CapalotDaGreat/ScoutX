"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.accountHoldKeys = accountHoldKeys;
exports.isAccountHeld = isAccountHeld;
exports.isTargetHeld = isTargetHeld;
exports.applyHold = applyHold;
exports.clearHold = clearHold;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const firebase_functions_1 = require("firebase-functions");
const model_1 = require("./model");
/** Holds on any of these keys take the whole public profile offline. */
function accountHoldKeys(uid) {
    return [(0, model_1.holdKey)('user', uid), (0, model_1.holdKey)('passport', uid), (0, model_1.holdKey)('scout', uid)];
}
async function isAccountHeld(uid, db = (0, firestore_1.getFirestore)()) {
    const snaps = await db.getAll(...accountHoldKeys(uid).map((key) => db.collection('moderationHolds').doc(key)));
    return snaps.some((snap) => snap.exists);
}
async function isTargetHeld(targetType, targetId, db = (0, firestore_1.getFirestore)()) {
    return (await db.collection('moderationHolds').doc((0, model_1.holdKey)(targetType, targetId)).get()).exists;
}
/** A stored download token keeps working until rotated; rotation revokes copied public links. */
async function rotateDownloadToken(path) {
    if (typeof path !== 'string' || !path)
        return;
    try {
        await (0, storage_1.getStorage)().bucket().file(path).setMetadata({ metadata: { firebaseStorageDownloadTokens: (0, node_crypto_1.randomUUID)() } });
    }
    catch (error) {
        firebase_functions_1.logger.warn('Moderation: could not rotate download token', {
            message: error instanceof Error ? error.message : 'unknown',
        });
    }
}
/** Hides a target from public projections and playback, remembering what to restore. */
async function applyHold(input, db = (0, firestore_1.getFirestore)()) {
    const now = new Date().toISOString();
    await db.collection('moderationHolds').doc((0, model_1.holdKey)(input.targetType, input.targetId)).set({
        ...input,
        createdAt: now,
    });
    if (input.targetType === 'media') {
        const ref = db.collection('players').doc(input.ownerId).collection('media').doc(input.targetId);
        const snap = await ref.get();
        if (snap.exists) {
            const data = snap.data() ?? {};
            const alreadyHeld = typeof data.visibilityBeforeHold === 'string';
            await ref.update({
                moderationState: input.state === 'removed' ? 'removed' : 'restricted',
                rightsState: input.state === 'removed' ? 'removed' : 'restricted',
                visibility: 'private',
                ...(alreadyHeld
                    ? {}
                    : { visibilityBeforeHold: data.visibility ?? 'private', rightsBeforeHold: data.rightsState ?? 'unconfirmed' }),
                updatedAt: now,
            });
            await Promise.all([rotateDownloadToken(data.storagePath), rotateDownloadToken(data.thumbnailPath)]);
        }
    }
    if (input.targetType === 'reel') {
        await db.collection('reels').doc(input.targetId).set({ moderationState: input.state, updatedAt: now }, { merge: true });
    }
}
/** Lifts a hold after a dismissal or a successful appeal. */
async function clearHold(targetType, targetId, ownerId, db = (0, firestore_1.getFirestore)()) {
    const ref = db.collection('moderationHolds').doc((0, model_1.holdKey)(targetType, targetId));
    const existed = (await ref.get()).exists;
    await ref.delete();
    if (targetType === 'media') {
        const mediaRef = db.collection('players').doc(ownerId).collection('media').doc(targetId);
        const snap = await mediaRef.get();
        if (snap.exists) {
            const data = snap.data() ?? {};
            await mediaRef.update({
                moderationState: 'none',
                rightsState: typeof data.rightsBeforeHold === 'string' ? data.rightsBeforeHold : 'unconfirmed',
                visibility: typeof data.visibilityBeforeHold === 'string' ? data.visibilityBeforeHold : 'private',
                visibilityBeforeHold: null,
                rightsBeforeHold: null,
                updatedAt: new Date().toISOString(),
            });
        }
    }
    if (targetType === 'reel') {
        await db.collection('reels').doc(targetId).set({ moderationState: 'none' }, { merge: true });
    }
    return existed;
}
//# sourceMappingURL=holds.js.map
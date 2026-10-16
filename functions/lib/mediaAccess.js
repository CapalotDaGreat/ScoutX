"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMediaPlaybackUrl = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const callableOptions_1 = require("./callableOptions");
const holds_1 = require("./moderation/holds");
const userSafety_1 = require("./safety/userSafety");
const rateLimit_1 = require("./security/rateLimit");
const PLAYBACK_MS = 15 * 60 * 1000;
function asRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value;
}
function ownedStoragePath(uid, storagePath) {
    return storagePath.startsWith(`profiles/${uid}/`) && !storagePath.includes('..');
}
async function grantedStoragePath(uid, storagePath, mediaId, reelId) {
    const now = new Date().toISOString();
    const snap = await (0, firestore_1.getFirestore)()
        .collection('mediaGrants')
        .where('granteeId', '==', uid)
        .limit(40)
        .get();
    for (const docSnap of snap.docs) {
        const grant = docSnap.data();
        if (typeof grant.expiresAt === 'string' && grant.expiresAt < now) {
            continue;
        }
        if (!grant.ownerId || (await (0, userSafety_1.loadSafetyPolicy)(grant.ownerId)).privateOnly) {
            continue;
        }
        if (mediaId && grant.mediaId === mediaId) {
            const media = await (0, firestore_1.getFirestore)()
                .collection('players')
                .doc(grant.ownerId)
                .collection('media')
                .doc(mediaId)
                .get();
            const data = media.data();
            if (data?.storagePath === storagePath &&
                data.rightsState === 'user_confirmed' &&
                (data.moderationState ?? 'none') === 'none' &&
                ownedStoragePath(grant.ownerId, storagePath) &&
                !(await (0, holds_1.isTargetHeld)('media', mediaId))) {
                return true;
            }
        }
        if (reelId && grant.reelId === reelId) {
            const reel = await (0, firestore_1.getFirestore)().collection('reels').doc(reelId).get();
            const data = reel.data();
            if (data?.ownerId === grant.ownerId &&
                ownedStoragePath(grant.ownerId, storagePath) &&
                !(await (0, holds_1.isTargetHeld)('reel', reelId))) {
                return true;
            }
        }
    }
    return false;
}
exports.getMediaPlaybackUrl = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    if (!request.auth?.uid) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication is required.');
    }
    const data = asRecord(request.data);
    const storagePath = typeof data?.storagePath === 'string' ? data.storagePath : '';
    const mediaId = typeof data?.mediaId === 'string' ? data.mediaId : undefined;
    const reelId = typeof data?.reelId === 'string' ? data.reelId : undefined;
    if (!storagePath || storagePath.includes('..')) {
        throw new https_1.HttpsError('invalid-argument', 'storagePath is required.');
    }
    const uid = request.auth.uid;
    const allowed = ownedStoragePath(uid, storagePath) || (await grantedStoragePath(uid, storagePath, mediaId, reelId));
    if (!allowed) {
        throw new https_1.HttpsError('permission-denied', 'You cannot play this media.');
    }
    await (0, rateLimit_1.assertCallableRateLimit)(uid, rateLimit_1.MEDIA_PLAYBACK_LIMIT);
    try {
        const expires = Date.now() + PLAYBACK_MS;
        const [url] = await (0, storage_1.getStorage)().bucket().file(storagePath).getSignedUrl({
            action: 'read',
            expires,
        });
        return { url, expiresAt: new Date(expires).toISOString() };
    }
    catch {
        throw new https_1.HttpsError('internal', 'Could not create a playback URL.');
    }
});
//# sourceMappingURL=mediaAccess.js.map
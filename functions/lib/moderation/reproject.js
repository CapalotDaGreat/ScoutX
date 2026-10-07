"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onMediaWrittenReproject = void 0;
exports.reprojectOwner = reprojectOwner;
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const firebase_functions_1 = require("firebase-functions");
const discoveryProjection_1 = require("../discoveryProjection");
const publicPassport_1 = require("../publicPassport");
/** Re-runs the public projections after a moderation hold or media visibility change. */
async function reprojectOwner(ownerId, db = (0, firestore_1.getFirestore)()) {
    const profile = await db.collection('profiles').doc(ownerId).get();
    await (0, publicPassport_1.projectPassport)(ownerId, profile.exists ? profile.data() : undefined);
    await (0, discoveryProjection_1.projectDiscoverablePlayer)(ownerId);
}
const PUBLIC_FIELDS = ['visibility', 'rightsState', 'moderationState'];
/** Passport videos come from media marked for the Passport, so changes there re-project it. */
exports.onMediaWrittenReproject = (0, firestore_2.onDocumentWritten)('players/{uid}/media/{mediaId}', async (event) => {
    const before = event.data?.before.data() ?? {};
    const after = event.data?.after.data() ?? {};
    if (PUBLIC_FIELDS.every((field) => before[field] === after[field]))
        return;
    try {
        await reprojectOwner(event.params.uid);
    }
    catch (error) {
        firebase_functions_1.logger.error('Media reprojection failed', { message: error instanceof Error ? error.message : 'unknown' });
        throw error;
    }
});
//# sourceMappingURL=reproject.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onVerificationWrittenSyncTrust = void 0;
exports.buildTrustProfileFromVerification = buildTrustProfileFromVerification;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
function asLevel(value) {
    return value === 'verified' || value === 'basic' ? value : 'none';
}
function buildTrustProfileFromVerification(playerId, verification, nowIso) {
    const identity = asLevel(verification.level);
    const dimensions = verification.dimensions && typeof verification.dimensions === 'object'
        ? verification.dimensions
        : {};
    const club = asLevel(dimensions.club ?? identity);
    const coach = asLevel(dimensions.coach);
    const verifiedAt = typeof verification.verifiedAt === 'string' ? verification.verifiedAt : null;
    return {
        playerId,
        player: { verified: identity === 'verified', verifiedAt: identity === 'verified' ? verifiedAt : null },
        scout: { verified: false, verifiedAt: null },
        club: {
            verified: club === 'verified',
            verifiedAt: club === 'verified' ? verifiedAt : null,
            clubId: null,
            clubName: null,
        },
        coach: { verified: coach === 'verified', verifiedAt: coach === 'verified' ? verifiedAt : null },
        updatedAt: nowIso,
    };
}
exports.onVerificationWrittenSyncTrust = (0, firestore_1.onDocumentWritten)('verificationStates/{stateId}', async (event) => {
    const after = event.data?.after.exists ? event.data.after.data() : null;
    const playerId = typeof after?.entityId === 'string' ? after.entityId : event.params.stateId.replace(/^player-/, '');
    if (!playerId || after?.entityType !== 'player') {
        return;
    }
    try {
        await (0, firestore_2.getFirestore)()
            .collection('trustProfiles')
            .doc(playerId)
            .set(buildTrustProfileFromVerification(playerId, after, new Date().toISOString()), { merge: true });
    }
    catch (error) {
        firebase_functions_1.logger.error('Failed to sync trust profile', { playerId, error });
        throw error;
    }
});
//# sourceMappingURL=trustSync.js.map
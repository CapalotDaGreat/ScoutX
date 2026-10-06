"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestEvidence = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const callableOptions_1 = require("./callableOptions");
const KINDS = ['match_footage', 'highlight', 'gps', 'statistics', 'coach_note'];
function isRecruiterRole(role) {
    return role === 'scout' || role === 'coach' || role === 'club' || role === 'admin';
}
exports.requestEvidence = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    }
    if (!isRecruiterRole(request.auth?.token.role)) {
        throw new https_1.HttpsError('permission-denied', 'Recruiter role required.');
    }
    const playerId = typeof request.data?.playerId === 'string' ? request.data.playerId : '';
    const message = typeof request.data?.message === 'string' ? request.data.message.slice(0, 500) : '';
    const kinds = Array.isArray(request.data?.kinds)
        ? request.data.kinds.filter((item) => typeof item === 'string' && KINDS.includes(item))
        : [];
    if (!playerId || playerId === uid) {
        throw new https_1.HttpsError('invalid-argument', 'A different player id is required.');
    }
    if (kinds.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'Select at least one evidence kind.');
    }
    const listing = await (0, firestore_1.getFirestore)().collection('discoverablePlayers').doc(playerId).get();
    if (!listing.exists) {
        throw new https_1.HttpsError('not-found', 'This player is not discoverable.');
    }
    const db = (0, firestore_1.getFirestore)();
    const blocked = await db
        .collection('blockedUsers')
        .where('blockerId', '==', playerId)
        .where('blockedUserId', '==', uid)
        .limit(1)
        .get();
    if (!blocked.empty) {
        // Do not reveal the block; the request is simply not delivered.
        return { id: null, status: 'pending' };
    }
    const now = new Date().toISOString();
    const ref = db.collection('evidenceRequests').doc();
    const batch = db.batch();
    batch.set(ref, {
        scoutId: uid,
        playerId,
        kinds,
        message,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
    });
    // Server-authored, fixed copy: the scout's free-text message never reaches the lock screen.
    batch.set(db.collection('activities').doc(`evidence-request-${ref.id}`), {
        recipientId: playerId,
        recipientRole: 'player',
        type: 'evidence_requested',
        category: 'scouting',
        title: 'Evidence requested',
        body: 'A scout asked for more evidence. Open your requests in ScoutX to respond.',
        actorId: 'system',
        actorName: 'ScoutX',
        actorRole: 'system',
        reference: { entityType: 'evidence_request', entityId: ref.id, label: 'Evidence request' },
        read: false,
        createdAt: now,
    });
    await batch.commit();
    return { id: ref.id, status: 'pending' };
});
//# sourceMappingURL=evidenceRequests.js.map
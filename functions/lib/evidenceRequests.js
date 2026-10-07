"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fulfillEvidenceRequest = exports.ATTACHMENT_KINDS = exports.requestEvidence = void 0;
exports.parseAttachments = parseAttachments;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const callableOptions_1 = require("./callableOptions");
const notificationProducers_1 = require("./notificationProducers");
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
exports.ATTACHMENT_KINDS = ['match', 'media', 'analysis', 'gps'];
const MAX_ATTACHMENTS = 10;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
function parseAttachments(value) {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ATTACHMENTS) {
        return null;
    }
    const out = [];
    const seen = new Set();
    for (const item of value) {
        const row = item && typeof item === 'object' ? item : null;
        const kind = row?.kind;
        const id = row?.id;
        if (typeof kind !== 'string' ||
            !exports.ATTACHMENT_KINDS.includes(kind) ||
            typeof id !== 'string' ||
            !ID_PATTERN.test(id)) {
            return null;
        }
        const key = `${kind}:${id}`;
        if (!seen.has(key)) {
            seen.add(key);
            out.push({ kind: kind, id });
        }
    }
    return out;
}
async function ownsAttachment(uid, attachment) {
    const db = (0, firestore_1.getFirestore)();
    switch (attachment.kind) {
        case 'match': {
            const sub = await db.collection('players').doc(uid).collection('matches').doc(attachment.id).get();
            if (sub.exists)
                return true;
            const profile = await db.collection('profiles').doc(uid).get();
            const matches = profile.get('statisticsMatches');
            return (Array.isArray(matches) &&
                matches.some((match) => {
                    const row = match && typeof match === 'object' ? match : null;
                    return row?.id === attachment.id;
                }));
        }
        case 'media': {
            const media = await db.collection('players').doc(uid).collection('media').doc(attachment.id).get();
            return media.exists && media.get('uploadState') !== 'failed';
        }
        case 'analysis': {
            const job = await db.collection('matchAnalysisJobs').doc(attachment.id).get();
            return job.exists && job.get('playerId') === uid && job.get('status') === 'complete';
        }
        case 'gps': {
            const session = await db.collection('gpsSessions').doc(attachment.id).get();
            return session.exists && session.get('playerId') === uid;
        }
    }
}
/**
 * Player answers a scout's evidence request with items they own. Ownership of every attachment
 * is checked server-side; the scout is notified with fixed copy.
 */
exports.fulfillEvidenceRequest = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    }
    const requestId = typeof request.data?.requestId === 'string' ? request.data.requestId : '';
    if (!ID_PATTERN.test(requestId)) {
        throw new https_1.HttpsError('invalid-argument', 'A request id is required.');
    }
    const attachments = parseAttachments(request.data?.attachments);
    if (!attachments) {
        throw new https_1.HttpsError('invalid-argument', `Attach between 1 and ${MAX_ATTACHMENTS} items.`);
    }
    const note = typeof request.data?.note === 'string' ? request.data.note.slice(0, 500) : '';
    const db = (0, firestore_1.getFirestore)();
    const ref = db.collection('evidenceRequests').doc(requestId);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.get('playerId') !== uid) {
        throw new https_1.HttpsError('not-found', 'Request not found.');
    }
    if (snapshot.get('status') !== 'pending') {
        throw new https_1.HttpsError('failed-precondition', 'This request is no longer open.');
    }
    for (const attachment of attachments) {
        if (!(await ownsAttachment(uid, attachment))) {
            throw new https_1.HttpsError('permission-denied', 'You can only attach your own items.');
        }
    }
    const now = new Date().toISOString();
    await ref.update({
        status: 'fulfilled',
        response: { attachments, note, fulfilledAt: now },
        updatedAt: now,
    });
    const scoutId = snapshot.get('scoutId');
    if (typeof scoutId === 'string') {
        await (0, notificationProducers_1.notifyEvidenceFulfilled)(db, scoutId, uid, requestId);
    }
    return { id: requestId, status: 'fulfilled' };
});
//# sourceMappingURL=evidenceRequests.js.map
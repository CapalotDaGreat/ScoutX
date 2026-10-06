"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAllUserData = deleteAllUserData;
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const firebase_functions_1 = require("firebase-functions");
const BATCH_SIZE = 400;
/** Documents whose ID is the user's UID. */
const UID_KEYED_COLLECTIONS = [
    'users',
    'profiles',
    'pushTokens',
    'discoverablePlayers',
    'authProviderTokens',
    'trustProfiles',
    'portfolioAnalytics',
    'recruitmentWorkspaces',
    'pushThrottle',
    'analysisQuotas',
];
/** Collections queried by an owner/participant field. */
const OWNED_QUERIES = [
    ['gpsSessions', 'playerId'],
    ['matchAnalysisJobs', 'playerId'],
    ['careerReplays', 'playerId'],
    ['activities', 'recipientId'],
    ['activities', 'actorId'],
    ['trialNotifications', 'recipientId'],
    ['trialInvitations', 'playerId'],
    ['trialInvitations', 'scoutId'],
    ['scoutingReports', 'scoutId'],
    ['scoutingReports', 'playerId'],
    ['trustRecommendations', 'playerId'],
    ['trustRecommendations', 'authorId'],
    ['blockedUsers', 'blockerId'],
    ['verificationRequests', 'requesterId'],
    ['verificationStates', 'entityId'],
    ['portfolioSlugs', 'playerId'],
    ['clubProfiles', 'ownerId'],
    ['reels', 'ownerId'],
    ['mediaGrants', 'ownerId'],
    ['mediaGrants', 'granteeId'],
    ['reelExports', 'ownerId'],
];
const STORAGE_PREFIXES = (uid) => [`profiles/${uid}/`, `gpsSessions/${uid}/`];
async function deleteQueryInBatches(query) {
    const db = (0, firestore_1.getFirestore)();
    let deleted = 0;
    for (;;) {
        const snapshot = await query.limit(BATCH_SIZE).get();
        if (snapshot.empty) {
            return deleted;
        }
        const batch = db.batch();
        snapshot.docs.forEach((document) => batch.delete(document.ref));
        await batch.commit();
        deleted += snapshot.size;
        if (snapshot.size < BATCH_SIZE) {
            return deleted;
        }
    }
}
/**
 * Removes all personal data owned by or addressed to the user. Failures are logged per
 * collection so one missing index or path doesn't leave the rest of the data behind.
 */
async function deleteAllUserData(uid) {
    const db = (0, firestore_1.getFirestore)();
    const failures = [];
    await Promise.all(UID_KEYED_COLLECTIONS.map(async (collection) => {
        try {
            await db.collection(collection).doc(uid).delete();
        }
        catch (error) {
            failures.push(collection);
            firebase_functions_1.logger.error('Account deletion: doc delete failed', {
                collection,
                message: error instanceof Error ? error.message : 'unknown',
            });
        }
    }));
    for (const [collection, field] of OWNED_QUERIES) {
        try {
            await deleteQueryInBatches(db.collection(collection).where(field, '==', uid));
        }
        catch (error) {
            failures.push(`${collection}.${field}`);
            firebase_functions_1.logger.error('Account deletion: query delete failed', {
                collection,
                field,
                message: error instanceof Error ? error.message : 'unknown',
            });
        }
    }
    const playerSubs = [
        'matches',
        'evidenceItems',
        'developmentGoals',
        'trainingSessions',
        'identitySnapshots',
        'media',
    ];
    for (const sub of playerSubs) {
        try {
            await deleteQueryInBatches(db.collection('players').doc(uid).collection(sub));
        }
        catch (error) {
            failures.push(`players.${sub}`);
            firebase_functions_1.logger.error('Account deletion: player subcollection failed', {
                sub,
                message: error instanceof Error ? error.message : 'unknown',
            });
        }
    }
    const bucket = (0, storage_1.getStorage)().bucket();
    for (const prefix of STORAGE_PREFIXES(uid)) {
        try {
            await bucket.deleteFiles({ prefix, force: true });
        }
        catch (error) {
            failures.push(`storage:${prefix.split('/')[0]}`);
            firebase_functions_1.logger.error('Account deletion: storage delete failed', {
                prefix: prefix.split('/')[0],
                message: error instanceof Error ? error.message : 'unknown',
            });
        }
    }
    return { failures };
}
//# sourceMappingURL=accountDeletion.js.map
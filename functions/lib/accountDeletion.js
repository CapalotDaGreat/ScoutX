"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANALYSIS_JOB_SUBCOLLECTIONS = exports.STORAGE_PREFIXES = exports.OWNED_QUERIES = exports.UID_KEYED_COLLECTIONS = void 0;
exports.deletePrimaryData = deletePrimaryData;
exports.deleteDerivedData = deleteDerivedData;
exports.deleteMediaData = deleteMediaData;
exports.verifyUserDataDeleted = verifyUserDataDeleted;
exports.deleteAllUserData = deleteAllUserData;
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const firebase_functions_1 = require("firebase-functions");
const redact_1 = require("./logging/redact");
const BATCH_SIZE = 400;
/** Documents whose ID is the user's UID. */
exports.UID_KEYED_COLLECTIONS = [
    'users',
    'profiles',
    'players',
    'pushTokens',
    'discoverablePlayers',
    'authProviderTokens',
    'trustProfiles',
    'portfolioAnalytics',
    'recruitmentWorkspaces',
    'pushThrottle',
    'notificationPreferences',
    'analysisQuotas',
    'publicPassports',
    'passportSummaries',
    'playerWatchers',
    'coachRosters',
    'userSafety',
    'guardianContacts',
    'entitlements',
    'usageLedger',
    'accountRestrictions',
    'scoutFootballSources',
];
/** Subcollections under UID-keyed documents (a parent delete leaves these behind). */
const UID_SUBCOLLECTIONS = (uid) => [
    `usageLedger/${uid}/periods`,
    `players/${uid}/matches`,
    `players/${uid}/evidenceItems`,
    `players/${uid}/developmentGoals`,
    `players/${uid}/trainingSessions`,
    `players/${uid}/identitySnapshots`,
    `players/${uid}/media`,
    `players/${uid}/trialReflections`,
    `players/${uid}/footballSources`,
    `recruitmentWorkspaces/${uid}/entries`,
    `moderationNotices/${uid}/items`,
    `consentRecords/${uid}/items`,
    `playerWatchers/${uid}/scouts`,
];
/** Collections queried by an owner/participant field. */
exports.OWNED_QUERIES = [
    ['gpsSessions', 'playerId'],
    ['matchAnalysisJobs', 'playerId'],
    ['videoProcessingConsents', 'uid'],
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
    ['verificationRequests', 'entityId'],
    ['verificationStates', 'entityId'],
    ['portfolioSlugs', 'playerId'],
    ['clubProfiles', 'ownerId'],
    ['reels', 'ownerId'],
    ['mediaGrants', 'ownerId'],
    ['mediaGrants', 'granteeId'],
    ['reelExports', 'ownerId'],
    ['scoutBriefs', 'scoutId'],
    ['scoutBriefs', 'playerId'],
    ['evidenceRequests', 'scoutId'],
    ['evidenceRequests', 'playerId'],
    ['watchlistEvents', 'scoutId'],
    ['watchlistEvents', 'playerId'],
    ['careerSnapshots', 'playerId'],
    ['coachObservations', 'coachId'],
    ['coachObservations', 'playerId'],
    ['contentReports', 'reporterId'],
    ['contentReports', 'targetId'],
    ['contentReports', 'targetOwnerId'],
    ['blockedUsers', 'blockedUserId'],
    ['youthConsents', 'uid'],
    ['mail', 'scoutxUid'],
    ['appeals', 'ownerId'],
    ['mediaUploads', 'ownerId'],
    ['mediaUploadSessions', 'ownerId'],
    ['mediaImportSources', 'ownerId'],
    ['uploadSessionLimits', 'ownerId'],
    ['revenueCatEvents', 'uid'],
    ['dataExports', 'uid'],
    ['privacyRequests', 'uid'],
];
const STORAGE_PREFIXES = (uid) => [
    `profiles/${uid}/`,
    `gpsSessions/${uid}/`,
    `quarantine/${uid}/`,
    `exports/${uid}/`,
];
exports.STORAGE_PREFIXES = STORAGE_PREFIXES;
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
exports.ANALYSIS_JOB_SUBCOLLECTIONS = ['segmentReviews', 'cvSegments', 'reports', 'corrections'];
async function deleteAnalysisJobsRecursively(uid) {
    const db = (0, firestore_1.getFirestore)();
    let deleted = 0;
    for (;;) {
        const snapshot = await db.collection('matchAnalysisJobs').where('playerId', '==', uid).limit(BATCH_SIZE).get();
        if (snapshot.empty)
            return deleted;
        for (const document of snapshot.docs)
            await db.recursiveDelete(document.ref);
        deleted += snapshot.size;
        if (snapshot.size < BATCH_SIZE)
            return deleted;
    }
}
/** Other coaches' rosters embed the player (with private notes); remove that entry. */
async function scrubCoachRosters(uid) {
    const db = (0, firestore_1.getFirestore)();
    for (;;) {
        const snapshot = await db
            .collection('coachRosters')
            .where('playerIds', 'array-contains', uid)
            .limit(BATCH_SIZE)
            .get();
        if (snapshot.empty) {
            return;
        }
        const batch = db.batch();
        snapshot.docs.forEach((document) => {
            const players = document.get('players');
            const remaining = Array.isArray(players)
                ? players.filter((item) => !(item && typeof item === 'object' && item.playerId === uid))
                : [];
            batch.update(document.ref, { players: remaining, playerIds: firestore_1.FieldValue.arrayRemove(uid) });
        });
        await batch.commit();
        if (snapshot.size < BATCH_SIZE) {
            return;
        }
    }
}
/** Runs one cleanup step; a failure is recorded (by label only, never data) and the rest continue. */
async function attempt(failures, label, run) {
    try {
        await run();
    }
    catch (error) {
        failures.push(label);
        firebase_functions_1.logger.error('Account deletion step failed', {
            label,
            ...(0, redact_1.logSafeError)(error),
        });
    }
}
/** The user's own documents: profile, matches, analyses, uploads, consents, entitlements. */
async function deletePrimaryData(uid) {
    const db = (0, firestore_1.getFirestore)();
    const failures = [];
    for (const path of UID_SUBCOLLECTIONS(uid)) {
        await attempt(failures, `${path.split('/')[0]}.${path.split('/')[2]}`, () => deleteQueryInBatches(db.collection(path)));
    }
    await Promise.all(exports.UID_KEYED_COLLECTIONS.map((collection) => attempt(failures, collection, () => db.collection(collection).doc(uid).delete())));
    await attempt(failures, 'consentRecords', () => db.collection('consentRecords').doc(uid).delete());
    // Analyses carry subcollections (segment reviews, report versions, feedback) that a plain
    // document delete would orphan.
    await attempt(failures, 'matchAnalysisJobs.subcollections', () => deleteAnalysisJobsRecursively(uid));
    for (const [collection, field] of exports.OWNED_QUERIES) {
        await attempt(failures, `${collection}.${field}`, () => deleteQueryInBatches(db.collection(collection).where(field, '==', uid)));
    }
    return { failures };
}
/** References to the user held in other people's documents. */
async function deleteDerivedData(uid) {
    const db = (0, firestore_1.getFirestore)();
    const failures = [];
    await attempt(failures, 'entries.playerId', () => deleteQueryInBatches(db.collectionGroup('entries').where('playerId', '==', uid)));
    await attempt(failures, 'playerWatchers.scoutId', () => deleteQueryInBatches(db.collectionGroup('scouts').where('scoutId', '==', uid)));
    await attempt(failures, 'coachRosters.playerIds', () => scrubCoachRosters(uid));
    return { failures };
}
/** Every Storage object under the user's prefixes (videos, frames, exports, quarantine). */
async function deleteMediaData(uid) {
    const failures = [];
    const bucket = (0, storage_1.getStorage)().bucket();
    for (const prefix of (0, exports.STORAGE_PREFIXES)(uid)) {
        await attempt(failures, `storage:${prefix.split('/')[0]}`, () => bucket.deleteFiles({ prefix, force: true }));
    }
    return { failures };
}
/** Confirms nothing personal is left; returns the labels of anything still present. */
async function verifyUserDataDeleted(uid) {
    const db = (0, firestore_1.getFirestore)();
    const remaining = [];
    const keyed = await Promise.all(exports.UID_KEYED_COLLECTIONS.map((collection) => db.collection(collection).doc(uid).get()));
    keyed.forEach((snap, index) => {
        if (snap.exists)
            remaining.push(exports.UID_KEYED_COLLECTIONS[index]);
    });
    if ((await db.collection('consentRecords').doc(uid).get()).exists)
        remaining.push('consentRecords');
    for (const [collection, field] of exports.OWNED_QUERIES) {
        const snap = await db.collection(collection).where(field, '==', uid).limit(1).get();
        if (!snap.empty)
            remaining.push(`${collection}.${field}`);
    }
    for (const path of UID_SUBCOLLECTIONS(uid)) {
        const snap = await db.collection(path).limit(1).get();
        if (!snap.empty)
            remaining.push(`${path.split('/')[0]}.${path.split('/')[2]}`);
    }
    const bucket = (0, storage_1.getStorage)().bucket();
    for (const prefix of (0, exports.STORAGE_PREFIXES)(uid)) {
        const [files] = await bucket.getFiles({ prefix, maxResults: 1 });
        if (files.length > 0)
            remaining.push(`storage:${prefix.split('/')[0]}`);
    }
    return remaining;
}
/**
 * Removes all personal data owned by or addressed to the user. Failures are logged per
 * collection so one missing index or path doesn't leave the rest of the data behind.
 */
async function deleteAllUserData(uid) {
    const primary = await deletePrimaryData(uid);
    const derived = await deleteDerivedData(uid);
    const media = await deleteMediaData(uid);
    return { failures: [...primary.failures, ...derived.failures, ...media.failures] };
}
//# sourceMappingURL=accountDeletion.js.map
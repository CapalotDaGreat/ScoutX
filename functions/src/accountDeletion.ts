import { FieldValue, getFirestore, type Query } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { logSafeError } from './logging/redact';

const BATCH_SIZE = 400;

/** Documents whose ID is the user's UID. */
export const UID_KEYED_COLLECTIONS = [
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
] as const;

/** Subcollections under UID-keyed documents (a parent delete leaves these behind). */
const UID_SUBCOLLECTIONS = (uid: string) => [
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
export const OWNED_QUERIES: ReadonlyArray<readonly [collection: string, field: string]> = [
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
  ['uploadSessionLimits', 'ownerId'],
  ['revenueCatEvents', 'uid'],
  ['dataExports', 'uid'],
  ['privacyRequests', 'uid'],
];

export const STORAGE_PREFIXES = (uid: string) => [
  `profiles/${uid}/`,
  `gpsSessions/${uid}/`,
  `quarantine/${uid}/`,
  `exports/${uid}/`,
];

async function deleteQueryInBatches(query: Query): Promise<number> {
  const db = getFirestore();
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

export const ANALYSIS_JOB_SUBCOLLECTIONS = ['segmentReviews', 'cvSegments', 'reports', 'corrections'] as const;

async function deleteAnalysisJobsRecursively(uid: string): Promise<number> {
  const db = getFirestore();
  let deleted = 0;
  for (;;) {
    const snapshot = await db.collection('matchAnalysisJobs').where('playerId', '==', uid).limit(BATCH_SIZE).get();
    if (snapshot.empty) return deleted;
    for (const document of snapshot.docs) await db.recursiveDelete(document.ref);
    deleted += snapshot.size;
    if (snapshot.size < BATCH_SIZE) return deleted;
  }
}

/** Other coaches' rosters embed the player (with private notes); remove that entry. */
async function scrubCoachRosters(uid: string): Promise<void> {
  const db = getFirestore();
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
      const players: unknown = document.get('players');
      const remaining = Array.isArray(players)
        ? players.filter(
            (item: unknown) =>
              !(item && typeof item === 'object' && (item as { playerId?: unknown }).playerId === uid),
          )
        : [];
      batch.update(document.ref, { players: remaining, playerIds: FieldValue.arrayRemove(uid) });
    });
    await batch.commit();
    if (snapshot.size < BATCH_SIZE) {
      return;
    }
  }
}

/** Runs one cleanup step; a failure is recorded (by label only, never data) and the rest continue. */
async function attempt(failures: string[], label: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    failures.push(label);
    logger.error('Account deletion step failed', {
      label,
      ...logSafeError(error),
    });
  }
}

/** The user's own documents: profile, matches, analyses, uploads, consents, entitlements. */
export async function deletePrimaryData(uid: string): Promise<{ failures: string[] }> {
  const db = getFirestore();
  const failures: string[] = [];
  for (const path of UID_SUBCOLLECTIONS(uid)) {
    await attempt(failures, `${path.split('/')[0]}.${path.split('/')[2]}`, () => deleteQueryInBatches(db.collection(path)));
  }
  await Promise.all(
    UID_KEYED_COLLECTIONS.map((collection) => attempt(failures, collection, () => db.collection(collection).doc(uid).delete())),
  );
  await attempt(failures, 'consentRecords', () => db.collection('consentRecords').doc(uid).delete());
  // Analyses carry subcollections (segment reviews, report versions, feedback) that a plain
  // document delete would orphan.
  await attempt(failures, 'matchAnalysisJobs.subcollections', () => deleteAnalysisJobsRecursively(uid));
  for (const [collection, field] of OWNED_QUERIES) {
    await attempt(failures, `${collection}.${field}`, () => deleteQueryInBatches(db.collection(collection).where(field, '==', uid)));
  }
  return { failures };
}

/** References to the user held in other people's documents. */
export async function deleteDerivedData(uid: string): Promise<{ failures: string[] }> {
  const db = getFirestore();
  const failures: string[] = [];
  await attempt(failures, 'entries.playerId', () => deleteQueryInBatches(db.collectionGroup('entries').where('playerId', '==', uid)));
  await attempt(failures, 'playerWatchers.scoutId', () => deleteQueryInBatches(db.collectionGroup('scouts').where('scoutId', '==', uid)));
  await attempt(failures, 'coachRosters.playerIds', () => scrubCoachRosters(uid));
  return { failures };
}

/** Every Storage object under the user's prefixes (videos, frames, exports, quarantine). */
export async function deleteMediaData(uid: string): Promise<{ failures: string[] }> {
  const failures: string[] = [];
  const bucket = getStorage().bucket();
  for (const prefix of STORAGE_PREFIXES(uid)) {
    await attempt(failures, `storage:${prefix.split('/')[0]}`, () => bucket.deleteFiles({ prefix, force: true }));
  }
  return { failures };
}

/** Confirms nothing personal is left; returns the labels of anything still present. */
export async function verifyUserDataDeleted(uid: string): Promise<string[]> {
  const db = getFirestore();
  const remaining: string[] = [];
  const keyed = await Promise.all(UID_KEYED_COLLECTIONS.map((collection) => db.collection(collection).doc(uid).get()));
  keyed.forEach((snap, index) => {
    if (snap.exists) remaining.push(UID_KEYED_COLLECTIONS[index]);
  });
  if ((await db.collection('consentRecords').doc(uid).get()).exists) remaining.push('consentRecords');
  for (const [collection, field] of OWNED_QUERIES) {
    const snap = await db.collection(collection).where(field, '==', uid).limit(1).get();
    if (!snap.empty) remaining.push(`${collection}.${field}`);
  }
  for (const path of UID_SUBCOLLECTIONS(uid)) {
    const snap = await db.collection(path).limit(1).get();
    if (!snap.empty) remaining.push(`${path.split('/')[0]}.${path.split('/')[2]}`);
  }
  const bucket = getStorage().bucket();
  for (const prefix of STORAGE_PREFIXES(uid)) {
    const [files] = await bucket.getFiles({ prefix, maxResults: 1 });
    if (files.length > 0) remaining.push(`storage:${prefix.split('/')[0]}`);
  }
  return remaining;
}

/**
 * Removes all personal data owned by or addressed to the user. Failures are logged per
 * collection so one missing index or path doesn't leave the rest of the data behind.
 */
export async function deleteAllUserData(uid: string): Promise<{ failures: string[] }> {
  const primary = await deletePrimaryData(uid);
  const derived = await deleteDerivedData(uid);
  const media = await deleteMediaData(uid);
  return { failures: [...primary.failures, ...derived.failures, ...media.failures] };
}

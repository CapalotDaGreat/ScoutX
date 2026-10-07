import { FieldValue, getFirestore, type Query } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';

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
  'notificationPreferences',
  'analysisQuotas',
  'publicPassports',
  'passportSummaries',
  'playerWatchers',
  'coachRosters',
  'userSafety',
  'guardianContacts',
] as const;

/** Collections queried by an owner/participant field. */
const OWNED_QUERIES: ReadonlyArray<readonly [collection: string, field: string]> = [
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
];

const STORAGE_PREFIXES = (uid: string) => [`profiles/${uid}/`, `gpsSessions/${uid}/`];

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

/**
 * Removes all personal data owned by or addressed to the user. Failures are logged per
 * collection so one missing index or path doesn't leave the rest of the data behind.
 */
export async function deleteAllUserData(uid: string): Promise<{ failures: string[] }> {
  const db = getFirestore();
  const failures: string[] = [];

  await Promise.all(
    UID_KEYED_COLLECTIONS.map(async (collection) => {
      try {
        await db.collection(collection).doc(uid).delete();
      } catch (error) {
        failures.push(collection);
        logger.error('Account deletion: doc delete failed', {
          collection,
          message: error instanceof Error ? error.message : 'unknown',
        });
      }
    }),
  );

  for (const [collection, field] of OWNED_QUERIES) {
    try {
      await deleteQueryInBatches(db.collection(collection).where(field, '==', uid));
    } catch (error) {
      failures.push(`${collection}.${field}`);
      logger.error('Account deletion: query delete failed', {
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
    'trialReflections',
  ];
  for (const sub of playerSubs) {
    try {
      await deleteQueryInBatches(db.collection('players').doc(uid).collection(sub));
    } catch (error) {
      failures.push(`players.${sub}`);
      logger.error('Account deletion: player subcollection failed', {
        sub,
        message: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  try {
    await deleteQueryInBatches(db.collection('recruitmentWorkspaces').doc(uid).collection('entries'));
  } catch (error) {
    failures.push('recruitmentWorkspaces.entries');
    logger.error('Account deletion: recruitment entries failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }

  try {
    await deleteQueryInBatches(
      db.collectionGroup('entries').where('playerId', '==', uid),
    );
  } catch (error) {
    failures.push('entries.playerId');
    logger.error('Account deletion: watched recruitment entries failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }

  try {
    await deleteQueryInBatches(db.collection('moderationNotices').doc(uid).collection('items'));
  } catch (error) {
    failures.push('moderationNotices');
    logger.error('Account deletion: moderation notices failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }

  try {
    await deleteQueryInBatches(db.collection('consentRecords').doc(uid).collection('items'));
    await db.collection('consentRecords').doc(uid).delete();
  } catch (error) {
    failures.push('consentRecords');
    logger.error('Account deletion: consent records failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }

  try {
    await deleteQueryInBatches(db.collection('playerWatchers').doc(uid).collection('scouts'));
  } catch (error) {
    failures.push('playerWatchers.scouts');
    logger.error('Account deletion: player watchers failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }

  try {
    await deleteQueryInBatches(db.collectionGroup('scouts').where('scoutId', '==', uid));
  } catch (error) {
    failures.push('playerWatchers.scoutId');
    logger.error('Account deletion: scout watcher docs failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }

  try {
    await scrubCoachRosters(uid);
  } catch (error) {
    failures.push('coachRosters.playerIds');
    logger.error('Account deletion: coach roster scrub failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }

  const bucket = getStorage().bucket();
  for (const prefix of STORAGE_PREFIXES(uid)) {
    try {
      await bucket.deleteFiles({ prefix, force: true });
    } catch (error) {
      failures.push(`storage:${prefix.split('/')[0]}`);
      logger.error('Account deletion: storage delete failed', {
        prefix: prefix.split('/')[0],
        message: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  return { failures };
}

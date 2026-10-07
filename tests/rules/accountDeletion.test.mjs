// Runs the compiled server-side account deletion against the emulators and checks that
// every user-owned record and Storage file is removed while other users' data survives.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { BUCKET, PROJECT_ID } from './emulator.mjs';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

const DELETED = 'deleted-user';
const KEPT = 'kept-user';

const uidKeyed = [
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
];

const ownedByField = [
  ['gpsSessions', 'playerId'],
  ['youthConsents', 'uid'],
  ['mail', 'scoutxUid'],
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
];

const storageFiles = (uid) => [
  `profiles/${uid}/avatar_1.jpg`,
  `profiles/${uid}/videos/v1/video.mp4`,
  `profiles/${uid}/matchFootage/j1/frames/frame_001.jpg`,
  `profiles/${uid}/reelExports/e1/reel.mp4`,
  `gpsSessions/${uid}/s1/points.json`,
];

let db;
let bucket;
let deleteAllUserData;

before(async () => {
  if (!getApps().length) {
    initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
  }
  db = getFirestore();
  bucket = getStorage().bucket();
  ({ deleteAllUserData } = require('./lib/accountDeletion.js'));

  for (const uid of [DELETED, KEPT]) {
    for (const collection of uidKeyed) {
      await db.collection(collection).doc(uid).set({ owner: uid });
    }
    for (const [collection, field] of ownedByField) {
      await db.collection(collection).doc(`${collection}-${field}-${uid}`).set({ [field]: uid });
    }
    for (const path of storageFiles(uid)) {
      await bucket.file(path).save(Buffer.from('x'));
    }
    for (const sub of [
      'matches',
      'evidenceItems',
      'developmentGoals',
      'trainingSessions',
      'identitySnapshots',
      'media',
      'trialReflections',
    ]) {
      await db.collection('players').doc(uid).collection(sub).doc('item-1').set({ owner: uid });
    }
    await db.collection('recruitmentWorkspaces').doc(uid).collection('entries').doc('p1').set({ playerId: 'p1' });
    await db.collection('playerWatchers').doc(uid).collection('scouts').doc('s1').set({ scoutId: 's1' });
  }

  // Cross-user references: another scout's workspace and watcher docs, and a third-party coach roster.
  for (const uid of [DELETED, KEPT]) {
    await db.collection('recruitmentWorkspaces').doc('other-scout').collection('entries').doc(uid).set({ playerId: uid });
    await db.collection('playerWatchers').doc('other-player').collection('scouts').doc(uid).set({ scoutId: uid });
  }
  await db.collection('coachRosters').doc('other-coach').set({
    coachId: 'other-coach',
    players: [
      { playerId: DELETED, addedAt: '2026-10-01T00:00:00.000Z', notes: 'private note' },
      { playerId: KEPT, addedAt: '2026-10-01T00:00:00.000Z', notes: '' },
    ],
    playerIds: [DELETED, KEPT],
  });
});

describe('deleteAllUserData', () => {
  test('removes every user-owned document and Storage file, and nothing else', async () => {
    const { failures } = await deleteAllUserData(DELETED);
    assert.deepEqual(failures, []);

    for (const collection of uidKeyed) {
      assert.equal((await db.collection(collection).doc(DELETED).get()).exists, false, `${collection}/${DELETED}`);
      assert.equal((await db.collection(collection).doc(KEPT).get()).exists, true, `${collection}/${KEPT} kept`);
    }
    for (const [collection, field] of ownedByField) {
      const remaining = await db.collection(collection).where(field, '==', DELETED).get();
      assert.equal(remaining.size, 0, `${collection}.${field} cleared`);
      const kept = await db.collection(collection).where(field, '==', KEPT).get();
      assert.equal(kept.size, 1, `${collection}.${field} of other user kept`);
    }
    for (const path of storageFiles(DELETED)) {
      const [exists] = await bucket.file(path).exists();
      assert.equal(exists, false, `${path} deleted`);
    }
    for (const path of storageFiles(KEPT)) {
      const [exists] = await bucket.file(path).exists();
      assert.equal(exists, true, `${path} kept`);
    }
    for (const sub of [
      'matches',
      'evidenceItems',
      'developmentGoals',
      'trainingSessions',
      'identitySnapshots',
      'media',
      'trialReflections',
    ]) {
      assert.equal(
        (await db.collection('players').doc(DELETED).collection(sub).get()).size,
        0,
        `players/${DELETED}/${sub} cleared`,
      );
      assert.equal(
        (await db.collection('players').doc(KEPT).collection(sub).get()).size,
        1,
        `players/${KEPT}/${sub} kept`,
      );
    }
  });

  test('removes references held in other users\' documents', async () => {
    const entries = db.collection('recruitmentWorkspaces').doc('other-scout').collection('entries');
    assert.equal((await entries.doc(DELETED).get()).exists, false, 'other scout entry about deleted player');
    assert.equal((await entries.doc(KEPT).get()).exists, true, 'other scout entry about kept player');

    const watchers = db.collection('playerWatchers').doc('other-player').collection('scouts');
    assert.equal((await watchers.doc(DELETED).get()).exists, false, 'deleted scout watcher doc');
    assert.equal((await watchers.doc(KEPT).get()).exists, true, 'kept scout watcher doc');

    const roster = (await db.collection('coachRosters').doc('other-coach').get()).data();
    assert.deepEqual(roster?.playerIds, [KEPT]);
    assert.deepEqual(
      roster?.players.map((item) => item.playerId),
      [KEPT],
    );
  });
});

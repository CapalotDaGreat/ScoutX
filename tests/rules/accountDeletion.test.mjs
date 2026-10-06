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
  'analysisQuotas',
  'publicPassports',
  'passportSummaries',
  'playerWatchers',
  'coachRosters',
];

const ownedByField = [
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
  ['scoutBriefs', 'scoutId'],
  ['scoutBriefs', 'playerId'],
  ['evidenceRequests', 'scoutId'],
  ['evidenceRequests', 'playerId'],
  ['watchlistEvents', 'scoutId'],
  ['watchlistEvents', 'playerId'],
  ['careerSnapshots', 'playerId'],
  ['coachObservations', 'coachId'],
  ['coachObservations', 'playerId'],
];

const storageFiles = (uid) => [
  `profiles/${uid}/avatar_1.jpg`,
  `profiles/${uid}/videos/v1/video.mp4`,
  `profiles/${uid}/matchFootage/j1/frames/frame_001.jpg`,
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
  }
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
  });
});

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
  'entitlements',
  'usageLedger',
  'accountRestrictions',
  'scoutFootballSources',
];

const ownedByField = [
  ['gpsSessions', 'playerId'],
  ['youthConsents', 'uid'],
  ['mail', 'scoutxUid'],
  ['appeals', 'ownerId'],
  ['mediaUploads', 'ownerId'],
  ['mediaUploadSessions', 'ownerId'],
  ['uploadSessionLimits', 'ownerId'],
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
  ['revenueCatEvents', 'uid'],
  ['dataExports', 'uid'],
  ['privacyRequests', 'uid'],
];

const storageFiles = (uid) => [
  `profiles/${uid}/avatar_1.jpg`,
  `profiles/${uid}/videos/v1/video.mp4`,
  `profiles/${uid}/matchFootage/j1/frames/frame_001.jpg`,
  `profiles/${uid}/reelExports/e1/reel.mp4`,
  `gpsSessions/${uid}/s1/points.json`,
  `quarantine/${uid}/up1/source`,
  `exports/${uid}/ex1/scoutx-data-export.json`,
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
      'footballSources',
    ]) {
      await db.collection('players').doc(uid).collection(sub).doc('item-1').set({ owner: uid });
    }
    await db.collection('recruitmentWorkspaces').doc(uid).collection('entries').doc('p1').set({ playerId: 'p1' });
    await db.collection('playerWatchers').doc(uid).collection('scouts').doc('s1').set({ scoutId: 's1' });
    await db.collection('moderationNotices').doc(uid).collection('items').doc('case-1').set({ caseId: 'case-1' });
    await db.collection('consentRecords').doc(uid).set({ uid });
    await db.collection('consentRecords').doc(uid).collection('items').doc('c1').set({ type: 'privacy_policy' });
    await db.collection('usageLedger').doc(uid).collection('periods').doc('p0').set({ counts: { reel_export: 1 } });
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
      'footballSources',
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
    assert.equal((await db.collection('moderationNotices').doc(DELETED).collection('items').get()).size, 0, 'notices');
    assert.equal((await db.collection('moderationNotices').doc(KEPT).collection('items').get()).size, 1, 'kept notices');
    assert.equal((await db.collection('consentRecords').doc(DELETED).get()).exists, false, 'consent summary');
    assert.equal((await db.collection('consentRecords').doc(DELETED).collection('items').get()).size, 0, 'consent items');
    assert.equal((await db.collection('consentRecords').doc(KEPT).collection('items').get()).size, 1, 'kept consent items');
    assert.equal((await db.collection('usageLedger').doc(DELETED).collection('periods').get()).size, 0, 'usage periods');
    assert.equal((await db.collection('usageLedger').doc(KEPT).collection('periods').get()).size, 1, 'kept usage periods');
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

describe('runAccountDeletion state machine', () => {
  const USER = 'machine-user';

  async function seedMachineUser() {
    await db.collection('users').doc(USER).set({ name: 'Machine User', email: 'machine@example.test' });
    await db.collection('discoverablePlayers').doc(USER).set({ name: 'Machine User' });
    await db.collection('consentRecords').doc(USER).set({
      uid: USER,
      consents: { privacy_policy: { status: 'granted', version: '1.0.0', at: '2026-10-01T00:00:00.000Z' } },
    });
    await db.collection('userSafety').doc(USER).set({ ageBand: '18plus', guardianStatus: 'not_required' });
    await db.collection('moderationCases').doc('machine-case').set({
      targetType: 'media', targetId: 'm1', targetOwnerId: USER, reasons: ['spam'], decision: 'remove', decidedAt: '2026-10-02T00:00:00.000Z', open: false,
    });
    await db.collection('privacyRequests').doc('machine-request').set({ uid: USER, type: 'access', status: 'completed', createdAt: '2026-10-01T00:00:00.000Z', closedAt: '2026-10-03T00:00:00.000Z' });
    await db.collection('matchAnalysisJobs').doc('machine-job').set({ playerId: USER, status: 'queued', pipelineState: 'queued' });
    await bucket.file(`profiles/${USER}/videos/v1/video.mp4`).save(Buffer.from('x'));
  }

  test('resumes after a failed step, keeps only minimised legal records and removes the progress doc', async () => {
    const { runAccountDeletion } = require('./lib/dataRights/deletion.js');
    const { subjectHash } = require('./lib/dataRights/legalRetention.js');
    await seedMachineUser();
    const calls = [];
    let authDeleteFails = true;
    const deps = {
      revokeProviderTokens: async (uid) => calls.push(['provider', uid]),
      revokeSessions: async (uid) => calls.push(['sessions', uid]),
      deleteAuthUser: async (uid) => {
        calls.push(['auth', uid]);
        if (authDeleteFails) throw new Error('auth backend down');
      },
    };

    const first = await runAccountDeletion(db, USER, deps);
    assert.equal(first.status, 'failed');
    assert.equal(first.step, 'completed');
    const progress = (await db.collection('deletionRequests').doc(USER).get()).data();
    assert.equal(progress.step, 'verified');
    assert.equal(progress.status, 'failed');
    assert.equal((await db.collection('users').doc(USER).get()).exists, false, 'data already gone before the auth step');
    assert.equal((await db.collection('discoverablePlayers').doc(USER).get()).exists, false);
    assert.equal((await bucket.file(`profiles/${USER}/videos/v1/video.mp4`).exists())[0], false);

    authDeleteFails = false;
    const second = await runAccountDeletion(db, USER, deps);
    assert.equal(second.status, 'completed');
    assert.deepEqual(calls.filter(([kind]) => kind === 'sessions').length, 1, 'finished steps are not repeated');
    assert.equal((await db.collection('deletionRequests').doc(USER).get()).exists, false);

    const hash = subjectHash(USER);
    const retained = await db.collection('legalRetention').where('subjectHash', '==', hash).get();
    const kinds = retained.docs.map((doc) => doc.get('kind')).sort();
    assert.deepEqual(kinds, ['consent_proof', 'deletion_receipt', 'moderation_decision', 'privacy_request']);
    for (const doc of retained.docs) {
      const text = JSON.stringify(doc.data());
      assert.equal(text.includes(USER), false, `${doc.get('kind')} does not contain the uid`);
      assert.equal(text.includes('machine@example.test'), false, 'no email');
      assert.ok(doc.get('deleteAfter'), 'has a retention end date');
    }
    const consent = retained.docs.find((doc) => doc.get('kind') === 'consent_proof').data();
    assert.equal(consent.consents.privacy_policy.version, '1.0.0');
    const moderationCase = (await db.collection('moderationCases').doc('machine-case').get()).data();
    assert.equal(moderationCase.targetOwnerId, null);
    assert.equal(moderationCase.targetOwnerHash, hash);
  });

  test('cancels active analysis work before deleting', async () => {
    const { runAccountDeletion } = require('./lib/dataRights/deletion.js');
    const uid = 'machine-user-2';
    await db.collection('matchAnalysisJobs').doc('machine-job-2').set({ playerId: uid, status: 'processing', pipelineState: 'extracting' });
    let seenCancelled = false;
    const deps = {
      revokeProviderTokens: async () => undefined,
      revokeSessions: async () => undefined,
      deleteAuthUser: async () => undefined,
    };
    const unsubscribe = db.collection('matchAnalysisJobs').doc('machine-job-2').onSnapshot((snap) => {
      if (snap.get('cancelRequested') === true) seenCancelled = true;
    });
    const outcome = await runAccountDeletion(db, uid, deps);
    unsubscribe();
    assert.equal(outcome.status, 'completed');
    assert.equal(seenCancelled, true);
    assert.equal((await db.collection('matchAnalysisJobs').doc('machine-job-2').get()).exists, false);
  });
});

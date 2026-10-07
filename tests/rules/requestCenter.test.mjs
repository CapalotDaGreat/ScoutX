// Runs the compiled fulfillEvidenceRequest callable against the Firestore emulator.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PROJECT_ID } from './emulator.mjs';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let db;
let fulfillEvidenceRequest;
let counter = 0;

function uid(prefix) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

function call(authUid, data) {
  return fulfillEvidenceRequest.run({
    data,
    auth: authUid ? { uid: authUid, token: {} } : undefined,
    rawRequest: {},
    acceptsStreaming: false,
  });
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return true;
  });
}

async function seedRequest(playerId, scoutId, status = 'pending') {
  const id = uid('req');
  await db.collection('evidenceRequests').doc(id).set({
    scoutId,
    playerId,
    kinds: ['match_footage'],
    message: '',
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return id;
}

before(() => {
  if (!getApps().length) {
    initializeApp({ projectId: PROJECT_ID });
  }
  db = getFirestore();
  ({ fulfillEvidenceRequest } = require('./lib/evidenceRequests.js'));
});

describe('fulfillEvidenceRequest', () => {
  test('rejects unauthenticated, malformed and empty submissions', async () => {
    await expectCode(call(null, { requestId: 'r1', attachments: [{ kind: 'media', id: 'm1' }] }), 'unauthenticated');
    await expectCode(call('p1', { requestId: '../x', attachments: [{ kind: 'media', id: 'm1' }] }), 'invalid-argument');
    await expectCode(call('p1', { requestId: 'r1', attachments: [] }), 'invalid-argument');
    await expectCode(call('p1', { requestId: 'r1', attachments: [{ kind: 'secret', id: 'm1' }] }), 'invalid-argument');
  });

  test('only the addressed player can answer, and only once', async () => {
    const player = uid('player');
    const scout = uid('scout');
    const requestId = await seedRequest(player, scout);
    await db.collection('players').doc(player).collection('media').doc('m1').set({ ownerId: player, uploadState: 'ready' });

    await expectCode(call(uid('other'), { requestId, attachments: [{ kind: 'media', id: 'm1' }] }), 'not-found');

    const result = await call(player, { requestId, attachments: [{ kind: 'media', id: 'm1' }], note: 'Second half' });
    assert.deepEqual(result, { id: requestId, status: 'fulfilled' });

    const stored = (await db.collection('evidenceRequests').doc(requestId).get()).data();
    assert.equal(stored.status, 'fulfilled');
    assert.deepEqual(stored.response.attachments, [{ kind: 'media', id: 'm1' }]);
    assert.equal(stored.response.note, 'Second half');

    const activity = (await db.collection('activities').doc(`evidence-fulfilled-${requestId}`).get()).data();
    assert.equal(activity.recipientId, scout);
    assert.equal(activity.type, 'evidence_fulfilled');

    await expectCode(call(player, { requestId, attachments: [{ kind: 'media', id: 'm1' }] }), 'failed-precondition');
  });

  test('attachments must belong to the player', async () => {
    const player = uid('player');
    const other = uid('other');
    const requestId = await seedRequest(player, uid('scout'));
    await db.collection('players').doc(other).collection('media').doc('foreign').set({ ownerId: other, uploadState: 'ready' });
    await db.collection('matchAnalysisJobs').doc('job-other').set({ playerId: other, status: 'complete' });
    await db.collection('matchAnalysisJobs').doc('job-pending').set({ playerId: player, status: 'processing' });

    await expectCode(call(player, { requestId, attachments: [{ kind: 'media', id: 'foreign' }] }), 'permission-denied');
    await expectCode(call(player, { requestId, attachments: [{ kind: 'analysis', id: 'job-other' }] }), 'permission-denied');
    await expectCode(call(player, { requestId, attachments: [{ kind: 'analysis', id: 'job-pending' }] }), 'permission-denied');
    await expectCode(call(player, { requestId, attachments: [{ kind: 'match', id: 'nope' }] }), 'permission-denied');

    const stored = (await db.collection('evidenceRequests').doc(requestId).get()).data();
    assert.equal(stored.status, 'pending');
  });

  test('legacy profile matches and completed analyses are accepted', async () => {
    const player = uid('player');
    const requestId = await seedRequest(player, uid('scout'));
    await db.collection('profiles').doc(player).set({ statisticsMatches: [{ id: 'match-1', opponent: 'FC Test' }] });
    await db.collection('matchAnalysisJobs').doc(`job-${player}`).set({ playerId: player, status: 'complete' });
    const result = await call(player, {
      requestId,
      attachments: [
        { kind: 'match', id: 'match-1' },
        { kind: 'analysis', id: `job-${player}` },
      ],
    });
    assert.equal(result.status, 'fulfilled');
  });

  test('declined requests cannot be fulfilled', async () => {
    const player = uid('player');
    const requestId = await seedRequest(player, uid('scout'), 'declined');
    await db.collection('players').doc(player).collection('media').doc('m1').set({ ownerId: player, uploadState: 'ready' });
    await expectCode(call(player, { requestId, attachments: [{ kind: 'media', id: 'm1' }] }), 'failed-precondition');
  });
});

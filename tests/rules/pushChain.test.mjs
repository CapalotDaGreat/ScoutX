// Runs the compiled push producers and delivery chain against the Firestore emulator with the
// Expo push endpoint replaced by a local mock server. Checks event -> activity -> policy ->
// preferences -> throttle -> token -> delivery, and that duplicate triggers never push twice.
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { PROJECT_ID } from './emulator.mjs';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const received = [];
let server;
let db;
let deliverActivityPush;
let producers;

function snapshot(data) {
  return { exists: data !== null, data: () => data ?? undefined };
}

function changeEvent(params, before, afterData) {
  return { params, data: { before: snapshot(before), after: snapshot(afterData) } };
}

async function activity(id) {
  const doc = await db.collection('activities').doc(id).get();
  return doc.exists ? doc.data() : null;
}

let counter = 0;
function uid(prefix) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

before(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      received.push(body ? JSON.parse(body) : null);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: { status: 'ok' } }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.EXPO_PUSH_URL = `http://127.0.0.1:${server.address().port}/push`;
  if (!getApps().length) {
    initializeApp({ projectId: PROJECT_ID });
  }
  db = getFirestore();
  ({ deliverActivityPush } = require('./lib/pushDelivery.js'));
  producers = require('./lib/notificationProducers.js');
});

after(async () => {
  delete process.env.EXPO_PUSH_URL;
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  received.length = 0;
});

describe('push chain (mock Expo endpoint)', () => {
  test('analysis completion creates one activity and delivers a routed push', async () => {
    const player = uid('player');
    const jobId = uid('job');
    await db.collection('pushTokens').doc(player).set({ token: 'ExponentPushToken[test]', userId: player });
    await db.collection('userSafety').doc(player).set({ ageBand: '18plus', guardianStatus: 'not_required', scopes: [] });

    const event = changeEvent({ jobId }, { status: 'processing', playerId: player }, { status: 'complete', playerId: player });
    await producers.onMatchAnalysisJobFinishedNotify.run(event);
    await producers.onMatchAnalysisJobFinishedNotify.run(event);

    const id = `analysis-completed-${jobId}`;
    const doc = await activity(id);
    assert.equal(doc.type, 'analysis_completed');
    assert.equal(doc.actorId, 'system');
    assert.equal(doc.recipientId, player);

    const outcome = await deliverActivityPush(id, doc);
    assert.deepEqual(outcome, { sent: true, path: `match/${jobId}` });
    assert.equal(received.length, 1);
    assert.equal(received[0].to, 'ExponentPushToken[test]');
    assert.equal(received[0].data.path, `match/${jobId}`);
    assert.equal(received[0].title, 'Match analysis ready');
  });

  test('a failed job notifies with failure copy; unchanged status does nothing', async () => {
    const player = uid('player');
    const jobId = uid('job');
    await producers.onMatchAnalysisJobFinishedNotify.run(
      changeEvent({ jobId }, { status: 'failed', playerId: player }, { status: 'failed', playerId: player }),
    );
    assert.equal(await activity(`analysis-failed-${jobId}`), null);
    await producers.onMatchAnalysisJobFinishedNotify.run(
      changeEvent({ jobId }, { status: 'processing', playerId: player }, { status: 'failed', playerId: player }),
    );
    assert.equal((await activity(`analysis-failed-${jobId}`)).type, 'analysis_failed');
  });

  test('trial acceptance notifies the scout, not the player', async () => {
    const trialId = uid('trial');
    const scout = uid('scout');
    const player = uid('player');
    await producers.onTrialInvitationUpdatedNotify.run(
      changeEvent(
        { trialId },
        { status: 'pending', scoutId: scout, playerId: player, history: [{}] },
        { status: 'accepted', scoutId: scout, playerId: player, history: [{}, {}] },
      ),
    );
    const doc = await activity(`trial-${trialId}-accepted-2`);
    assert.equal(doc.recipientId, scout);
    assert.equal(doc.recipientRole, 'scout');
    assert.equal(doc.type, 'trial_update');
  });

  test('disabled category suppresses delivery', async () => {
    const player = uid('player');
    await db.collection('pushTokens').doc(player).set({ token: 'ExponentPushToken[muted]' });
    await db.collection('notificationPreferences').doc(player).set({
      pushEnabled: true,
      categories: { analysis: false },
    });
    const outcome = await deliverActivityPush('x', {
      recipientId: player,
      recipientRole: 'player',
      actorId: 'system',
      type: 'analysis_completed',
      title: 'Match analysis ready',
      body: 'Ready.',
      reference: { entityType: 'match_analysis', entityId: 'j1' },
    });
    assert.deepEqual(outcome, { sent: false, reason: 'category_disabled' });
    assert.equal(received.length, 0);
  });

  test('cooldown throttles a second push of the same type', async () => {
    const player = uid('player');
    await db.collection('pushTokens').doc(player).set({ token: 'ExponentPushToken[cool]' });
    const doc = {
      recipientId: player,
      recipientRole: 'player',
      actorId: 'system',
      type: 'passport_improved',
      title: 'Football Passport improved',
      body: 'New evidence.',
      reference: { entityType: 'player', entityId: player },
    };
    assert.equal((await deliverActivityPush('a', doc)).sent, true);
    assert.deepEqual(await deliverActivityPush('b', doc), { sent: false, reason: 'cooldown' });
    assert.equal(received.length, 1);
  });

  test('no token means no delivery; client-forged copy to another user is refused', async () => {
    const player = uid('player');
    const noToken = await deliverActivityPush('c', {
      recipientId: player,
      actorId: 'system',
      type: 'analysis_completed',
      title: 'T',
      body: 'B',
    });
    assert.deepEqual(noToken, { sent: false, reason: 'no_token' });

    const forged = await deliverActivityPush('d', {
      recipientId: player,
      actorId: 'someone-else',
      type: 'evidence_fulfilled',
      title: 'Click this link',
      body: 'phish',
    });
    assert.deepEqual(forged, { sent: false, reason: 'no_copy' });
    assert.equal(received.length, 0);
  });

  test('passport improvement only fires when coverage becomes solid', async () => {
    const player = uid('player');
    await producers.onPassportSummaryWrittenNotifyOwner.run(
      changeEvent({ playerId: player }, { coverage: [{ id: 'technical', state: 'limited' }] }, {
        coverage: [{ id: 'technical', state: 'limited' }],
      }),
    );
    const day = new Date().toISOString().slice(0, 10);
    assert.equal(await activity(`passport-improved-${player}-${day}`), null);
    await producers.onPassportSummaryWrittenNotifyOwner.run(
      changeEvent({ playerId: player }, { coverage: [{ id: 'technical', state: 'limited' }] }, {
        coverage: [{ id: 'technical', state: 'moderate' }],
      }),
    );
    assert.equal((await activity(`passport-improved-${player}-${day}`)).type, 'passport_improved');
  });

  test('evidence fulfilment notifies the requesting scout once', async () => {
    const scout = uid('scout');
    const requestId = uid('req');
    await producers.notifyEvidenceFulfilled(db, scout, 'p1', requestId);
    await producers.notifyEvidenceFulfilled(db, scout, 'p1', requestId);
    const doc = await activity(`evidence-fulfilled-${requestId}`);
    assert.equal(doc.recipientId, scout);
    assert.equal(doc.reference.entityId, 'p1');
  });
});

describe('lock-screen privacy', () => {
  function systemActivity(player) {
    return {
      recipientId: player,
      recipientRole: 'player',
      actorId: 'system',
      type: 'analysis_completed',
      title: 'Match analysis ready',
      body: 'Your analysis vs FC Example is ready.',
      reference: { entityType: 'match_analysis', entityId: 'j1' },
    };
  }

  test('minors always get generic copy, even if they asked for details', async () => {
    const player = uid('teen');
    await db.collection('pushTokens').doc(player).set({ token: 'ExponentPushToken[teen]' });
    await db.collection('userSafety').doc(player).set({ ageBand: '13-17', guardianStatus: 'approved', scopes: [] });
    await db.collection('notificationPreferences').doc(player).set({ pushEnabled: true, categories: {}, lockScreenPreview: 'details' });
    assert.equal((await deliverActivityPush('t1', systemActivity(player))).sent, true);
    assert.equal(received[0].title, 'PitchProof');
    assert.equal(received[0].body, 'You have a new update. Open PitchProof to see it.');
    assert.equal(received[0].data.path, 'match/j1', 'routing still works after unlock');
  });

  test('accounts without an age band fail closed to generic copy', async () => {
    const player = uid('unknown');
    await db.collection('pushTokens').doc(player).set({ token: 'ExponentPushToken[unknown]' });
    await deliverActivityPush('u1', systemActivity(player));
    assert.equal(received[0].title, 'PitchProof');
  });

  test('adults can switch to generic copy and back', async () => {
    const player = uid('adult');
    await db.collection('pushTokens').doc(player).set({ token: 'ExponentPushToken[adult]' });
    await db.collection('userSafety').doc(player).set({ ageBand: '18plus', guardianStatus: 'not_required', scopes: [] });
    await db.collection('notificationPreferences').doc(player).set({ pushEnabled: true, categories: {}, lockScreenPreview: 'generic' });
    await deliverActivityPush('a1', systemActivity(player));
    assert.equal(received[0].title, 'PitchProof');

    await db.collection('notificationPreferences').doc(player).set({ pushEnabled: true, categories: {}, lockScreenPreview: 'details' });
    await db.collection('pushThrottle').doc(player).delete();
    await deliverActivityPush('a2', systemActivity(player));
    assert.equal(received[1].title, 'Match analysis ready');
  });
});
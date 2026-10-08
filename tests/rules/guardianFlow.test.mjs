// Runs the compiled guardian consent callables against the Firestore emulator. The guardian link
// is taken from the email queued in the Trigger Email `mail` collection, exactly as a guardian
// would receive it.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PROJECT_ID } from './emulator.mjs';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let db;
let guardian;
let counter = 0;

function uid(prefix) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

function call(fn, authUid, data, email) {
  return fn.run({
    data,
    auth: authUid ? { uid: authUid, token: email ? { email } : {} } : undefined,
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

async function mailFor(playerId, purpose) {
  const snap = await db.collection('mail').where('scoutxUid', '==', playerId).get();
  const docs = snap.docs.map((doc) => doc.data()).filter((doc) => doc.purpose === purpose);
  assert.ok(docs.length > 0, `no ${purpose} mail for ${playerId}`);
  return docs.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
}

function tokenFrom(mail) {
  const match = /\/guardian\/\?t=([A-Za-z0-9._%-]+)/.exec(mail.message.text);
  assert.ok(match, 'mail contains a guardian link');
  return decodeURIComponent(match[1]);
}

async function teen() {
  const player = uid('teen');
  await call(guardian.setAgeBand, player, { ageBand: '13-17' });
  return player;
}

async function safety(player) {
  return (await db.collection('userSafety').doc(player).get()).data();
}

before(() => {
  process.env.GUARDIAN_LINK_SECRET = 'guardian-flow-test-secret-0123456789';
  process.env.GUARDIAN_LINK_BASE_URL = 'https://guardian.test';
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  db = getFirestore();
  guardian = require('./lib/safety/youthConsent.js');
});

after(() => {
  delete process.env.GUARDIAN_LINK_SECRET;
  delete process.env.GUARDIAN_LINK_BASE_URL;
});

describe('guardian consent flow (mail captured from the mail collection)', () => {
  test('request, open link, approve chosen scopes, then revoke from the confirmation mail', async () => {
    const player = await teen();
    assert.equal((await safety(player)).guardianStatus, 'required');

    const requested = await call(guardian.requestGuardianConsent, player, {
      guardianEmail: 'parent@example.com',
      playerFirstName: 'Lena Muster',
    });
    assert.equal(requested.status, 'pending');
    assert.equal((await safety(player)).guardianStatus, 'pending');

    const mail = await mailFor(player, 'guardian_consent');
    assert.deepEqual(mail.to, ['parent@example.com']);
    assert.ok(mail.message.text.includes('https://guardian.test/guardian/?t='));
    const token = tokenFrom(mail);

    const view = await call(guardian.getGuardianConsentRequest, null, { token });
    assert.equal(view.purpose, 'consent');
    assert.equal(view.playerFirstName, 'Lena', 'only the first name reaches the guardian page');

    await expectCode(
      call(guardian.respondGuardianConsent, null, { token, decision: 'approve', scopes: ['discovery'] }),
      'invalid-argument',
    );
    const approved = await call(guardian.respondGuardianConsent, null, {
      token,
      decision: 'approve',
      scopes: ['public_passport', 'discovery', 'not_a_scope'],
      confirmGuardian: true,
    });
    assert.deepEqual(approved.scopes, ['public_passport', 'discovery']);
    const state = await safety(player);
    assert.equal(state.guardianStatus, 'approved');
    assert.deepEqual(state.scopes, ['public_passport', 'discovery']);
    assert.ok(Date.parse(state.consentExpiresAt) > Date.now());

    await expectCode(call(guardian.getGuardianConsentRequest, null, { token }), 'permission-denied');

    const revokeToken = tokenFrom(await mailFor(player, 'guardian_confirmation'));
    const revoked = await call(guardian.respondGuardianConsent, null, { token: revokeToken, decision: 'revoke' });
    assert.equal(revoked.status, 'revoked');
    assert.deepEqual((await safety(player)).scopes, []);
    assert.equal((await safety(player)).guardianStatus, 'revoked');
  });

  test('tampered, foreign-secret and superseded links are refused', async () => {
    const player = await teen();
    await call(guardian.requestGuardianConsent, player, { guardianEmail: 'guardian1@example.com' });
    const first = tokenFrom(await mailFor(player, 'guardian_consent'));

    const [body, signature] = first.split('.');
    const flipped = `${body}.${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;
    await expectCode(call(guardian.getGuardianConsentRequest, null, { token: flipped }), 'permission-denied');
    await expectCode(call(guardian.getGuardianConsentRequest, null, { token: 'not-a-token' }), 'permission-denied');

    await call(guardian.requestGuardianConsent, player, { guardianEmail: 'guardian2@example.com' });
    await expectCode(
      call(guardian.respondGuardianConsent, null, { token: first, decision: 'approve', confirmGuardian: true, scopes: [] }),
      'permission-denied',
    );
    assert.equal((await safety(player)).guardianStatus, 'pending');
  });

  test('players cannot use their own email, adults need no guardian, bands only get stricter', async () => {
    const player = await teen();
    await expectCode(
      call(guardian.requestGuardianConsent, player, { guardianEmail: 'me@example.com' }, 'me@example.com'),
      'invalid-argument',
    );
    const adult = uid('adult');
    await call(guardian.setAgeBand, adult, { ageBand: '18plus' });
    await expectCode(
      call(guardian.requestGuardianConsent, adult, { guardianEmail: 'parent@example.com' }),
      'failed-precondition',
    );
    await expectCode(call(guardian.setAgeBand, player, { ageBand: '18plus' }), 'failed-precondition');
    assert.equal((await safety(player)).ageBand, '13-17', 'a teen cannot loosen their own age band');
  });

  test('guardian emails are limited to three per day', async () => {
    const player = await teen();
    for (let i = 0; i < 3; i += 1) {
      await call(guardian.requestGuardianConsent, player, { guardianEmail: `g${i}@example.com` });
    }
    await expectCode(
      call(guardian.requestGuardianConsent, player, { guardianEmail: 'g4@example.com' }),
      'resource-exhausted',
    );
  });

  test('a minor trial waits for the guardian, who can decline it from the mail link', async () => {
    const player = await teen();
    await call(guardian.requestGuardianConsent, player, { guardianEmail: 'trialparent@example.com', playerFirstName: 'Noah' });
    const trialId = uid('trial');
    const ref = db.collection('trialInvitations').doc(trialId);
    await ref.set({ playerId: player, scoutId: uid('scout'), status: 'pending', club: 'FC Example', history: [] });
    await guardian.onTrialInvitationCreatedGuardian.run({ params: { trialId }, data: await ref.get() });

    const pending = (await ref.get()).data();
    assert.equal(pending.guardianApproval, 'pending');
    assert.equal(typeof pending.guardianTokenHash, 'string');

    const token = tokenFrom(await mailFor(player, 'guardian_trial'));
    const view = await call(guardian.getGuardianConsentRequest, null, { token });
    assert.equal(view.purpose, 'trial');
    assert.equal(view.trial.club, 'FC Example');

    const result = await call(guardian.respondGuardianConsent, null, { token, decision: 'decline' });
    assert.equal(result.guardianApproval, 'declined');
    const declined = (await ref.get()).data();
    assert.equal(declined.status, 'declined');
    assert.equal(declined.guardianTokenHash, null, 'the link works once');
  });
});

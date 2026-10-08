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
let childAccounts;
let roleClaims;
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

async function child(name = 'child') {
  const player = uid(name);
  await call(guardian.setAgeBand, player, { ageBand: 'under13' });
  return player;
}

before(() => {
  process.env.GUARDIAN_LINK_SECRET = 'guardian-flow-test-secret-0123456789';
  process.env.GUARDIAN_LINK_BASE_URL = 'https://guardian.test';
  // Auth Admin calls fail fast instead of reaching for real credentials.
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:1';
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  db = getFirestore();
  guardian = require('./lib/safety/youthConsent.js');
  childAccounts = require('./lib/safety/childAccounts.js');
  roleClaims = require('./lib/roleClaims.js');
});

after(() => {
  delete process.env.GUARDIAN_LINK_SECRET;
  delete process.env.GUARDIAN_LINK_BASE_URL;
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
});

describe('under-13 parental consent (signed form, then confirmation email)', () => {
  test('notice, signed form, second email and confirmation; only AI analysis can be granted', async () => {
    const player = await child();
    const pendingState = await safety(player);
    assert.equal(pendingState.guardianStatus, 'required');
    assert.ok(Date.parse(pendingState.childDeleteAfter) > Date.now());

    await call(guardian.requestGuardianConsent, player, { guardianEmail: 'mum@example.com', playerFirstName: 'Leo' });
    const notice = await mailFor(player, 'guardian_consent');
    assert.deepEqual(notice.to, ['mum@example.com']);
    assert.match(notice.message.text, /under 13/);
    assert.match(notice.message.text, /Nobody else can see the profile/);
    assert.match(notice.message.text, /within 14 days/);
    assert.match(notice.message.text, /privacy-policy/);
    const token = tokenFrom(notice);

    const view = await call(guardian.getGuardianConsentRequest, null, { token });
    assert.equal(view.child, true);
    assert.deepEqual(view.scopes, ['ai_analysis']);

    const base = { token, decision: 'approve', confirmGuardian: true, acknowledged: true, scopes: ['discovery', 'scout_contact', 'ai_analysis'] };
    await expectCode(call(guardian.respondGuardianConsent, null, { ...base, signature: '' }), 'invalid-argument');
    await expectCode(call(guardian.respondGuardianConsent, null, { ...base, signature: '<script>' }), 'invalid-argument');
    await expectCode(
      call(guardian.respondGuardianConsent, null, { ...base, signature: 'Anna Muster', acknowledged: false }),
      'invalid-argument',
    );
    const signed = await call(guardian.respondGuardianConsent, null, { ...base, signature: 'Anna Muster' });
    assert.equal(signed.status, 'confirming');
    const confirming = await safety(player);
    assert.equal(confirming.guardianStatus, 'confirming');
    assert.deepEqual(confirming.scopes, [], 'nothing is granted before the second email is confirmed');
    await expectCode(call(guardian.getGuardianConsentRequest, null, { token }), 'permission-denied');

    const confirmToken = tokenFrom(await mailFor(player, 'guardian_child_confirm'));
    const confirmView = await call(guardian.getGuardianConsentRequest, null, { token: confirmToken });
    assert.equal(confirmView.purpose, 'confirm');
    assert.deepEqual(confirmView.pendingScopes, ['ai_analysis']);
    await expectCode(
      call(guardian.respondGuardianConsent, null, { token: confirmToken, decision: 'approve', confirmGuardian: true, scopes: ['discovery'] }),
      'invalid-argument',
    );
    const confirmed = await call(guardian.respondGuardianConsent, null, { token: confirmToken, decision: 'confirm' });
    assert.equal(confirmed.status, 'approved');
    assert.deepEqual(confirmed.scopes, ['ai_analysis']);

    const state = await safety(player);
    assert.equal(state.guardianStatus, 'approved');
    assert.deepEqual(state.scopes, ['ai_analysis']);
    assert.ok(Date.parse(state.childDeleteAfter) > Date.parse(state.consentExpiresAt), 'kept while consent is valid');
    const record = (await db.collection('youthConsents').doc(state.consentId).get()).data();
    assert.equal(record.signature.name, 'Anna Muster');
    assert.equal(record.method, 'email_plus_signed_form');
    assert.ok(record.audit.some((entry) => entry.event === 'signed'));
    assert.ok(record.audit.some((entry) => entry.event === 'confirmed'));
    await expectCode(call(guardian.respondGuardianConsent, null, { token: confirmToken, decision: 'confirm' }), 'permission-denied');

    const activeMail = await mailFor(player, 'guardian_confirmation');
    assert.match(activeMail.message.text, /private mode/);
  });

  test('a parent declining closes the account', async () => {
    const player = await child('child-decline');
    await call(guardian.requestGuardianConsent, player, { guardianEmail: 'dad@example.com', playerFirstName: 'Mia' });
    const token = tokenFrom(await mailFor(player, 'guardian_consent'));
    const result = await call(guardian.respondGuardianConsent, null, { token, decision: 'decline' });
    assert.equal(result.accountDeleted, true);
    await mailFor(player, 'guardian_child_closed');
    assert.equal((await db.collection('deletionRequests').doc(player).get()).exists, true, 'deletion started');
    const state = await safety(player);
    if (state) assert.ok(Date.parse(state.childDeleteAfter) <= Date.now(), 'cleanup finishes an interrupted deletion');
  });

  test('accounts without valid consent are deleted by the daily cleanup; others are kept', async () => {
    const noop = async () => undefined;
    const deps = { revokeProviderTokens: noop, revokeSessions: noop, deleteAuthUser: noop };
    const overdue = uid('child-overdue');
    const waiting = uid('child-waiting');
    const teen = uid('teen-overdue');
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await db.collection('users').doc(overdue).set({ name: 'Overdue' });
    await db.collection('userSafety').doc(overdue).set({ ageBand: 'under13', guardianStatus: 'pending', scopes: [], childDeleteAfter: past });
    await db.collection('userSafety').doc(waiting).set({ ageBand: 'under13', guardianStatus: 'pending', scopes: [], childDeleteAfter: future });
    await db.collection('userSafety').doc(teen).set({ ageBand: '13-17', guardianStatus: 'pending', scopes: [], childDeleteAfter: past });

    await childAccounts.deleteUnconsentedChildAccounts(db, new Date(), deps);
    assert.equal((await db.collection('users').doc(overdue).get()).exists, false);
    assert.equal((await db.collection('userSafety').doc(overdue).get()).exists, false);
    assert.equal((await db.collection('userSafety').doc(waiting).get()).exists, true);
    assert.equal((await db.collection('userSafety').doc(teen).get()).exists, true);
  });

  test('children can only use the player role', async () => {
    const player = await child('child-role');
    for (const role of ['scout', 'coach']) {
      await assert.rejects(
        roleClaims.confirmRole.run({
          data: { role },
          auth: { uid: player, token: { firebase: { sign_in_provider: 'password' } } },
          rawRequest: {},
          acceptsStreaming: false,
        }),
        (error) => error.code === 'failed-precondition' && error.details?.reason === 'child_player_only',
      );
    }
  });
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

  test('one link used twice at the same time only succeeds once', async () => {
    const player = await teen();
    await call(guardian.requestGuardianConsent, player, { guardianEmail: 'race@example.com' });
    const token = tokenFrom(await mailFor(player, 'guardian_consent'));
    const results = await Promise.allSettled([
      call(guardian.respondGuardianConsent, null, { token, decision: 'approve', confirmGuardian: true, scopes: ['discovery'] }),
      call(guardian.respondGuardianConsent, null, { token, decision: 'decline' }),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    assert.equal(fulfilled.length, 1, 'exactly one decision is recorded');
    const rejected = results.find((result) => result.status === 'rejected');
    assert.equal(rejected.reason.code, 'permission-denied');
    const winner = fulfilled[0].value.status;
    assert.equal((await safety(player)).guardianStatus, winner);
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

  test('changing an approved minor trial sends it back to the guardian', async () => {
    const player = await teen();
    await call(guardian.requestGuardianConsent, player, { guardianEmail: 'moveparent@example.com', playerFirstName: 'Mia' });
    const trialId = uid('trial');
    const ref = db.collection('trialInvitations').doc(trialId);
    await ref.set({ playerId: player, scoutId: uid('scout'), status: 'pending', club: 'FC Example', location: 'Field 1', scheduledDate: '2026-11-01', history: [] });
    await guardian.onTrialInvitationCreatedGuardian.run({ params: { trialId }, data: await ref.get() });
    const firstToken = tokenFrom(await mailFor(player, 'guardian_trial'));
    await call(guardian.respondGuardianConsent, null, { token: firstToken, decision: 'approve' });
    await ref.update({ status: 'accepted' });
    assert.equal((await ref.get()).get('guardianApproval'), 'approved');

    const before = await ref.get();
    await ref.update({ location: 'Somewhere else', scheduledDate: '2026-11-02' });
    const after = await ref.get();
    await guardian.onTrialInvitationUpdatedGuardian.run({ params: { trialId }, data: { before, after } });

    const moved = (await ref.get()).data();
    assert.equal(moved.guardianApproval, 'pending', 'old approval no longer applies');
    assert.equal(moved.status, 'pending', 'accepted trial needs acceptance again');
    assert.notEqual(moved.guardianTokenHash, null);
    const secondToken = tokenFrom(await mailFor(player, 'guardian_trial'));
    assert.notEqual(secondToken, firstToken, 'guardian gets a fresh link');
    await expectCode(call(guardian.getGuardianConsentRequest, null, { token: firstToken }), 'permission-denied');

    const unchanged = await ref.get();
    await ref.update({ notes: 'Bring boots' });
    await guardian.onTrialInvitationUpdatedGuardian.run({ params: { trialId }, data: { before: unchanged, after: await ref.get() } });
    assert.equal((await ref.get()).get('guardianTokenHash'), moved.guardianTokenHash, 'notes alone do not re-trigger');
  });
});

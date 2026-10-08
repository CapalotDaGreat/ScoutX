// Server-side recent sign-in for account deletion, run against the Firestore emulator through the
// compiled callables. The Auth Admin API points at a closed port, so a request that passes the
// recent-auth check fails later with `aborted` instead of deleting a real account; the point here
// is which requests are refused before any data is touched.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PROJECT_ID } from './emulator.mjs';

process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:1';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let db;
let appleAuth;
let youth;
let counter = 0;

const nowSec = () => Math.floor(Date.now() / 1000);
const fresh = (provider = 'password') => ({ auth_time: nowSec() - 30, firebase: { sign_in_provider: provider } });
const stale = (provider = 'password') => ({ auth_time: nowSec() - 3600, firebase: { sign_in_provider: provider } });

function uid(prefix) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

function call(fn, authUid, data, token) {
  return fn.run({ data, auth: authUid ? { uid: authUid, token } : undefined, rawRequest: { headers: {} }, acceptsStreaming: false });
}

async function rejection(promise) {
  try {
    await promise;
    return { code: 'ok' };
  } catch (error) {
    return { code: error.code, reason: error.details?.reason, message: error.message };
  }
}

async function seedUser(id) {
  await db.collection('users').doc(id).set({ name: 'Delete Me' });
  await db.collection('discoverablePlayers').doc(id).set({ name: 'Delete Me' });
}

async function untouched(id) {
  assert.equal((await db.collection('users').doc(id).get()).exists, true, 'user doc survives');
  assert.equal((await db.collection('discoverablePlayers').doc(id).get()).exists, true, 'still discoverable');
  assert.equal((await db.collection('deletionRequests').doc(id).get()).exists, false, 'no deletion started');
}

before(() => {
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  db = getFirestore();
  appleAuth = require('./lib/appleAuth.js');
  youth = require('./lib/safety/youthConsent.js');
});

describe('deleteAuthenticatedAccount recent sign-in', () => {
  test('refuses unauthenticated callers', async () => {
    assert.equal((await rejection(call(appleAuth.deleteAuthenticatedAccount, null, {}))).code, 'unauthenticated');
  });

  for (const provider of ['password', 'apple.com', 'google.com']) {
    test(`refuses a stale ${provider} session with a safe message and touches nothing`, async () => {
      const id = uid('stale');
      await seedUser(id);
      const result = await rejection(call(appleAuth.deleteAuthenticatedAccount, id, {}, stale(provider)));
      assert.equal(result.code, 'failed-precondition');
      assert.equal(result.reason, 'recent_login_required');
      assert.equal(result.message, 'For your security, please sign in again before deleting your account.');
      await untouched(id);
    });
  }

  test('refuses a token without auth_time', async () => {
    const id = uid('noauth');
    await seedUser(id);
    const result = await rejection(call(appleAuth.deleteAuthenticatedAccount, id, {}, {}));
    assert.equal(result.reason, 'recent_login_required');
    await untouched(id);
  });

  test('a fresh sign-in passes the check and starts deletion', async () => {
    const id = uid('fresh');
    await seedUser(id);
    const result = await rejection(call(appleAuth.deleteAuthenticatedAccount, id, {}, fresh('apple.com')));
    assert.notEqual(result.reason, 'recent_login_required');
    assert.equal((await db.collection('discoverablePlayers').doc(id).get()).exists, false, 'hidden first');
    assert.equal((await db.collection('deletionRequests').doc(id).get()).exists, true);
  });

  test('anonymous guests pass without re-authentication', async () => {
    const id = uid('guest');
    await seedUser(id);
    const result = await rejection(call(appleAuth.deleteAuthenticatedAccount, id, {}, stale('anonymous')));
    assert.notEqual(result.reason, 'recent_login_required');
  });

  test('a deletion started recently can be resumed with an older session', async () => {
    const id = uid('resume');
    await seedUser(id);
    await db.collection('deletionRequests').doc(id).set({ uid: id, step: 'requested', status: 'failed', requestedAt: new Date(Date.now() - 3600_000).toISOString() });
    const result = await rejection(call(appleAuth.deleteAuthenticatedAccount, id, {}, stale()));
    assert.notEqual(result.reason, 'recent_login_required');
  });

  test('an abandoned deletion request older than a day does not bypass the check', async () => {
    const id = uid('old');
    await seedUser(id);
    await db.collection('deletionRequests').doc(id).set({ uid: id, step: 'requested', status: 'failed', requestedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() });
    const result = await rejection(call(appleAuth.deleteAuthenticatedAccount, id, {}, stale()));
    assert.equal(result.reason, 'recent_login_required');
  });
});

describe('setAgeBand under-13 deletion', () => {
  test('an established account cannot be deleted by switching to under-13 with a stale session', async () => {
    const id = uid('adult');
    await call(youth.setAgeBand, id, { ageBand: '18plus' }, fresh());
    await seedUser(id);
    const result = await rejection(call(youth.setAgeBand, id, { ageBand: 'under13' }, stale()));
    assert.equal(result.code, 'failed-precondition');
    assert.equal(result.reason, 'recent_login_required');
    await untouched(id);
    assert.equal((await db.collection('userSafety').doc(id).get()).get('ageBand'), '18plus');
  });

  test('the same switch with a fresh sign-in proceeds to deletion', async () => {
    const id = uid('adult-fresh');
    await call(youth.setAgeBand, id, { ageBand: '18plus' }, fresh());
    await seedUser(id);
    const result = await rejection(call(youth.setAgeBand, id, { ageBand: 'under13' }, fresh()));
    assert.notEqual(result.reason, 'recent_login_required');
    assert.equal((await db.collection('discoverablePlayers').doc(id).get()).exists, false);
  });
});

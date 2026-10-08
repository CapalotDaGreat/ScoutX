import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DELETION_RECENT_AUTH_SEC,
  DELETION_RESUME_WINDOW_MS,
  decideDeletionAuth,
  isRecentSignIn,
} from '../../functions/src/security/recentAuth.ts';
import {
  ReauthError,
  classifyDeletionError,
  classifyReauthError,
  reauthMethodsFor,
} from '../../src/features/auth/services/reauthModel.ts';

const NOW = Date.parse('2026-10-08T12:00:00.000Z');
const nowSec = NOW / 1000;

function decide(overrides: Partial<Parameters<typeof decideDeletionAuth>[0]>) {
  return decideDeletionAuth({ authTime: undefined, signInProvider: 'password', pendingRequestedAt: undefined, nowMs: NOW, ...overrides });
}

describe('deletion recent-auth policy', () => {
  test('a fresh sign-in with any credential provider is allowed', () => {
    for (const provider of ['password', 'apple.com', 'google.com']) {
      assert.deepEqual(decide({ signInProvider: provider, authTime: nowSec - 30 }), { allowed: true, basis: 'recent_sign_in' });
    }
  });

  test('a stale, missing or malformed auth_time requires signing in again', () => {
    for (const authTime of [nowSec - DELETION_RECENT_AUTH_SEC - 1, nowSec - 3600, undefined, null, 'abc', 0, -5]) {
      assert.deepEqual(decide({ authTime }), { allowed: false, reason: 'recent_login_required' });
    }
  });

  test('an auth_time far in the future is rejected, small clock skew is tolerated', () => {
    assert.equal(isRecentSignIn(nowSec + 30, NOW, DELETION_RECENT_AUTH_SEC), true);
    assert.equal(isRecentSignIn(nowSec + 3600, NOW, DELETION_RECENT_AUTH_SEC), false);
  });

  test('anonymous guest sessions cannot re-authenticate and are allowed', () => {
    assert.deepEqual(decide({ signInProvider: 'anonymous', authTime: nowSec - 86_400 }), { allowed: true, basis: 'anonymous' });
  });

  test('an already-started deletion can be resumed within a day, not after', () => {
    const stale = nowSec - 3600;
    const recentStart = new Date(NOW - 60 * 60 * 1000).toISOString();
    assert.deepEqual(decide({ authTime: stale, pendingRequestedAt: recentStart }), { allowed: true, basis: 'resume' });
    const oldStart = new Date(NOW - DELETION_RESUME_WINDOW_MS - 1000).toISOString();
    assert.equal(decide({ authTime: stale, pendingRequestedAt: oldStart }).allowed, false);
    const futureStart = new Date(NOW + 60 * 60 * 1000).toISOString();
    assert.equal(decide({ authTime: stale, pendingRequestedAt: futureStart }).allowed, false);
    assert.equal(decide({ authTime: stale, pendingRequestedAt: 12345 }).allowed, false);
  });
});

describe('client deletion re-authentication model', () => {
  test('only the server reason or Firebase recent-login code asks for a fresh sign-in', () => {
    assert.equal(classifyDeletionError({ code: 'functions/failed-precondition', details: { reason: 'recent_login_required' } }), 'recent_login_required');
    assert.equal(classifyDeletionError({ code: 'auth/requires-recent-login' }), 'recent_login_required');
    assert.equal(classifyDeletionError({ code: 'functions/aborted', details: { reason: 'deletion_incomplete' } }), 'failed');
    assert.equal(classifyDeletionError(new Error('offline')), 'failed');
    assert.equal(classifyDeletionError(null), 'failed');
  });

  test('offers only linked providers that can re-authenticate', () => {
    assert.deepEqual(reauthMethodsFor(['password', 'apple.com', 'phone', 'password']), ['password', 'apple.com']);
    assert.deepEqual(reauthMethodsFor(['google.com']), ['google.com']);
    assert.deepEqual(reauthMethodsFor([]), []);
  });

  test('maps re-authentication failures without exposing Firebase codes', () => {
    assert.equal(classifyReauthError({ code: 'auth/wrong-password' }), 'wrong_password');
    assert.equal(classifyReauthError({ code: 'auth/invalid-credential' }), 'wrong_password');
    assert.equal(classifyReauthError({ code: 'auth/user-mismatch' }), 'wrong_account');
    assert.equal(classifyReauthError({ code: 'auth/too-many-requests' }), 'too_many_attempts');
    assert.equal(classifyReauthError({ code: 'ERR_REQUEST_CANCELED' }), 'cancelled');
    assert.equal(classifyReauthError(new ReauthError('cancelled')), 'cancelled');
    assert.equal(classifyReauthError({ code: 'auth/internal-error' }), 'failed');
  });
});

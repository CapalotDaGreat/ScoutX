import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { decideRestoredSession, isUnreadableProfileError } from '../../src/features/auth/services/restoredSession.ts';
import { isRestoringSession } from '../../src/features/auth/store/sessionBootstrap.ts';
import { failedSafetyRead, recordForAccount, safetyLoadFailed } from '../../src/features/youth-safety/context/recordForAccount.ts';

const adult = { ageBand: '18plus', guardianStatus: 'not_required', scopes: [], consentExpiresAt: null, guardianEmailMasked: null, childDeleteAfter: null } as const;

describe('B-20: the session curtain has no gap before the age/guardian gate', () => {
  test('covers while the Auth listener is still answering', () => {
    assert.equal(isRestoringSession('loading', true, false), true);
  });

  test('keeps covering for the render in which a restored user is known but not applied yet', () => {
    // This render exposed the linked screen; the youth-gate curtain then covered it and ate a tap on Back.
    assert.equal(isRestoringSession('loading', false, true), true);
  });

  test('does not cover a visitor whose anonymous session is still being created', () => {
    assert.equal(isRestoringSession('loading', false, false), false);
  });

  test('never covers a settled session', () => {
    for (const listenerLoading of [true, false]) {
      for (const hasUser of [true, false]) {
        assert.equal(isRestoringSession('authenticated', listenerLoading, hasUser), false);
        assert.equal(isRestoringSession('unauthenticated', listenerLoading, hasUser), false);
      }
    }
  });
});

describe('B-20: the age/guardian gate never reuses another account\'s record', () => {
  test('no gated account means no record', () => {
    assert.equal(recordForAccount(null, { uid: 'a', record: adult }), null);
  });

  test('the record is pending until it arrives for this account', () => {
    assert.equal(recordForAccount('a', null), undefined);
  });

  test('a record read for the previous account keeps the new account gated', () => {
    assert.equal(recordForAccount('b', { uid: 'a', record: adult }), undefined);
  });

  test('the account\'s own record, or its confirmed absence, is used', () => {
    assert.deepEqual(recordForAccount('a', { uid: 'a', record: adult }), adult);
    assert.equal(recordForAccount('a', { uid: 'a', record: null }), null);
  });

  test('a failed read is not a missing age band', () => {
    const failed = { uid: 'a', record: null, unavailable: true };
    assert.equal(recordForAccount('a', failed), undefined);
    assert.equal(safetyLoadFailed('a', failed), true);
    assert.equal(safetyLoadFailed('a', { uid: 'a', record: null }), false);
    assert.equal(safetyLoadFailed(null, failed), false);
  });

  test('any subscription failure holds an unread account instead of requesting a new age band', () => {
    const failed = failedSafetyRead('a', null);
    assert.equal(recordForAccount('a', failed), undefined);
    assert.equal(safetyLoadFailed('a', failed), true);
    assert.deepEqual(failedSafetyRead('a', failed), failed, 'repeated errors remain unreadable');
  });

  test('a subscription failure preserves a loaded record or confirmed absence only for its own account', () => {
    const loaded = { uid: 'a', record: adult };
    assert.equal(failedSafetyRead('a', loaded), loaded);
    const missing = { uid: 'a', record: null };
    assert.equal(failedSafetyRead('a', missing), missing);
    const switched = failedSafetyRead('b', loaded);
    assert.equal(recordForAccount('b', switched), undefined);
    assert.equal(safetyLoadFailed('b', switched), true);
  });
});

describe('B-25: an unreadable restored profile is not role selection', () => {
  test('offline or unavailable profile errors are unreadable', () => {
    assert.equal(isUnreadableProfileError(Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' })), true);
    assert.equal(isUnreadableProfileError(new Error('Missing or insufficient permissions.')), false);
  });

  test('a signed-in account whose profile cannot be read is held, not asked to choose a role', () => {
    assert.deepEqual(
      decideRestoredSession({ anonymous: false, claimRole: undefined, read: { status: 'unreadable' } }),
      { action: 'hold-offline' },
    );
  });

  test('a cached role claim is kept when the profile read fails', () => {
    assert.deepEqual(
      decideRestoredSession({ anonymous: false, claimRole: 'scout', read: { status: 'unreadable' } }),
      { action: 'emit', role: 'scout', pendingRoleSelection: false },
    );
  });

  test('a missing profile still needs a role, and a found role does not', () => {
    assert.deepEqual(
      decideRestoredSession({ anonymous: false, claimRole: undefined, read: { status: 'missing' } }),
      { action: 'emit', role: undefined, pendingRoleSelection: true },
    );
    assert.deepEqual(
      decideRestoredSession({ anonymous: false, claimRole: undefined, read: { status: 'found', role: 'player' } }),
      { action: 'emit', role: 'player', pendingRoleSelection: false },
    );
  });

  test('an anonymous session stays a guest', () => {
    assert.deepEqual(
      decideRestoredSession({ anonymous: true, claimRole: undefined, read: { status: 'unreadable' } }),
      { action: 'emit', role: 'guest', pendingRoleSelection: false },
    );
  });
});

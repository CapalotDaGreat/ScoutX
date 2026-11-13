import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { isRestoringSession } from '../../src/features/auth/store/sessionBootstrap.ts';
import { recordForAccount } from '../../src/features/youth-safety/context/recordForAccount.ts';

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
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { settleForAccount } from '../../src/features/auth/store/accountScopedResult.ts';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const denied = Object.assign(new Error("false for 'get' @ L546"), { code: 'permission-denied' });

describe('B-23: account-bound results after the session changes', () => {
  test('a response that arrives after sign-out is dropped, not applied to the next session', async () => {
    let current: string | null = 'player';
    const pending = deferred<{ email: string }>();
    const result = settleForAccount('player', () => current, () => pending.promise);
    current = 'guest';
    pending.resolve({ email: 'player@example.test' });
    assert.deepEqual(await result, { stale: true });
  });

  test("the old account's expected permission denial during sign-out is not an error", async () => {
    let current: string | null = 'player';
    const pending = deferred<never>();
    const result = settleForAccount('player', () => current, () => pending.promise);
    current = null;
    pending.reject(denied);
    assert.deepEqual(await result, { stale: true });
  });

  test('a rapid sign-out and sign-in to another account never shows the first account', async () => {
    let current: string | null = 'player';
    const first = deferred<string>();
    const firstResult = settleForAccount('player', () => current, () => first.promise);
    current = 'guest';
    current = 'scout';
    const second = settleForAccount('scout', () => current, async () => 'scout-settings');
    first.resolve('player-settings');
    assert.deepEqual(await firstResult, { stale: true });
    assert.deepEqual(await second, { stale: false, value: 'scout-settings' });
  });

  test('a genuine permission failure for the signed-in account stays visible', async () => {
    await assert.rejects(settleForAccount('player', () => 'player', async () => { throw denied; }), denied);
  });

  test('the current account gets its own result', async () => {
    assert.deepEqual(await settleForAccount('player', () => 'player', async () => 42), { stale: false, value: 42 });
  });
});

describe('B-23: sign-out starts exactly one replacement guest session', () => {
  const provider = readFileSync(new URL('../../src/features/auth/store/AuthProvider.tsx', import.meta.url), 'utf8');
  test('the anonymous bootstrap is marked started before Firebase sign-out, so it cannot run in parallel', () => {
    const signOut = provider.slice(provider.indexOf('const signOut = useCallback'));
    const guard = signOut.indexOf('anonymousBootstrapStartedRef.current = true;');
    assert.ok(guard > -1 && guard < signOut.indexOf('await signOutFromFirebase();'));
  });

  test('Settings drops stale loads and does not show the previous account while loading', () => {
    const hook = readFileSync(new URL('../../src/features/notifications/hooks/useNotificationPreferences.ts', import.meta.url), 'utf8');
    assert.match(hook, /settleForAccount\(\s*userId,\s*\(\) => currentUserId\.current/);
    assert.match(hook, /if \(outcome\.stale\) \{\s*return;/);
    assert.match(hook, /setHasToken\(false\);\s*let outcome/);
  });
});

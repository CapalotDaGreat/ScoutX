import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProfileRetry } from '../../src/features/auth/services/profileRetry.ts';
import type { AuthUser } from '../../src/features/auth/types/index.ts';

const result = (uid: string, profileOffline = false) => ({
  user: { uid, id: uid, name: uid, isAnonymous: false, role: 'player' } satisfies AuthUser,
  profileOffline,
});
function pending() {
  let resolve!: (value: ReturnType<typeof result> | null) => void;
  const promise = new Promise<ReturnType<typeof result> | null>((done) => { resolve = done; });
  return { promise, resolve };
}

test('profile retry drops a previous account after sign-out or an account switch before the listener fires', async () => {
  for (const nextUid of [null, 'b']) {
    let uid: string | null = 'a';
    const applied: unknown[] = [];
    const retry = createProfileRetry(() => uid, (next) => applied.push(next));
    const read = pending();
    const work = retry.retry(() => read.promise);
    uid = nextUid;
    read.resolve(result('a'));
    await work;
    assert.deepEqual(applied, []);
  }
});

test('listener updates and unmount cancellation supersede pending retries even for the same uid', async () => {
  const applied: unknown[] = [];
  const retry = createProfileRetry(() => 'a', (next) => applied.push(next));
  const read = pending();
  const work = retry.retry(() => read.promise);
  retry.invalidate();
  read.resolve(result('a', true));
  await work;
  assert.deepEqual(applied, []);
});

test('only the latest overlapping profile retry may update the session', async () => {
  const applied: unknown[] = [];
  const retry = createProfileRetry(() => 'a', (next) => applied.push(next));
  const older = pending();
  const first = retry.retry(() => older.promise);
  const expected = result('a');
  await retry.retry(async () => expected);
  older.resolve(result('a', true));
  await first;
  assert.deepEqual(applied, [expected]);
});

test('signed-out retries do not read profiles; mismatched or missing responses are ignored', async () => {
  const retry = createProfileRetry(() => null, () => assert.fail('must not apply'));
  await retry.retry(async () => { assert.fail('must not read'); });
  const signedIn = createProfileRetry(() => 'a', () => assert.fail('must not apply'));
  await signedIn.retry(async () => result('b'));
  await signedIn.retry(async () => null);
});

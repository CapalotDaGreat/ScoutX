import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { mergeBlockedUser, visibleForViewer } from '../../src/features/trust-safety/services/blockedUserState.ts';
import type { BlockedUser } from '../../src/features/trust-safety/types.ts';

const entry: BlockedUser = { blockerId: 'viewer', blockedUserId: 'blocked', blockedUserName: 'Test player', createdAt: '2026-10-24', active: true };
test('unready block state never exposes a directory or related-player record', () => {
  assert.deepEqual(visibleForViewer([{ id: 'blocked' }, { id: 'other' }], new Set(), false), []);
  assert.deepEqual(visibleForViewer([{ id: 'blocked' }, { id: 'other' }], new Set(['blocked']), true), [{ id: 'other' }]);
});
test('a mutation cannot fabricate completeness; repeated blocks are immutable and deduplicated', () => {
  assert.equal(mergeBlockedUser(undefined, entry), undefined);
  const original = [entry];
  const result = mergeBlockedUser(original, { ...entry, blockedUserName: 'Updated' });
  assert.equal(original[0].blockedUserName, 'Test player');
  assert.equal(result?.length, 1);
  assert.equal(result?.[0].blockedUserName, 'Updated');
});
test('viewer-scoped cache mutations update multiple observers without crossing accounts', () => {
  const client = new QueryClient();
  const key = ['blockedUsers', 'viewer'];
  client.setQueryData(key, []);
  client.setQueryData(['blockedUsers', 'other-viewer'], []);
  const first = new QueryObserver<BlockedUser[]>(client, { queryKey: key, enabled: false });
  const second = new QueryObserver<BlockedUser[]>(client, { queryKey: key, enabled: false });
  const stopFirst = first.subscribe(() => undefined), stopSecond = second.subscribe(() => undefined);
  client.setQueryData<BlockedUser[]>(key, (current) => mergeBlockedUser(current, entry));
  assert.deepEqual(first.getCurrentResult().data, [entry]);
  assert.deepEqual(second.getCurrentResult().data, [entry]);
  assert.deepEqual(client.getQueryData(['blockedUsers', 'other-viewer']), []);
  stopFirst(); stopSecond(); client.clear();
});

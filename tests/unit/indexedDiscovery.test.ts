import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { buildDiscoverySearchIndex, sameDiscoverySearchIndex, indexedSearchMatches, SEARCH_SORTS } from '../../functions/src/discoverySearchIndex.ts';
import { discoveryIndexQuery, readIndexedDiscoveryPage, type IndexRow } from '../../src/features/scout-discovery/services/indexedDiscoveryPage.ts';
import { defaultDiscoveryFilters, type DiscoveryQuery } from '../../src/features/scout-discovery/types.ts';
import { mockDiscoverablePlayers } from '../../src/features/scout-discovery/services/mockPlayerDiscoveryData.ts';
const query: DiscoveryQuery = { search: '', searchScope: 'all', filters: defaultDiscoveryFilters, sort: 'name' };
test('every sort has a native prefix index and canonical/server policy copies match', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../firestore.indexes.json', import.meta.url), 'utf8')) as {
    indexes: { collectionGroup: string; fields: { fieldPath: string; arrayConfig?: string; order?: string }[] }[];
  };
  for (const sort of SEARCH_SORTS) assert.ok(manifest.indexes.some((index) => index.collectionGroup === 'discoverablePlayers'
    && index.fields.some((f) => f.fieldPath === '_search.tokens' && f.arrayConfig === 'CONTAINS')
    && index.fields.some((f) => f.fieldPath === `_search.order.${sort}` && f.order === 'ASCENDING')));
  assert.equal(readFileSync(new URL('../../functions/src/discoverySearchIndex.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../../src/features/scout-discovery/services/discoverySearchIndex.ts', import.meta.url), 'utf8'));
  const deployment = JSON.parse(readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8')) as { functions: { predeploy: string[] }[] };
  assert.ok(deployment.functions[0].predeploy.includes('node scripts/sync-discovery-search.mjs --check'));
  const pkg = JSON.parse(readFileSync(new URL('../../functions/package.json', import.meta.url), 'utf8')) as { scripts: { build: string } };
  assert.equal(pkg.scripts.build.includes('../'), false);
});
test('query input is bounded without imposing a directory size cap', () => {
  for (const search of ['a'.repeat(257), Array(13).fill('a').join(' ')]) assert.throws(() => discoveryIndexQuery({ ...query, search }));
  assert.equal(discoveryIndexQuery({ ...query, search: 'a'.repeat(80) }).token, `all:${'a'.repeat(32)}`);
});
const rows: IndexRow[] = Array.from({ length: 701 }, (_, i) => ({ id: `p${String(i).padStart(4, '0')}`, order: `0${String(i).padStart(4, '0')}`,
  player: { ...mockDiscoverablePlayers[0], id: `p${String(i).padStart(4, '0')}` } }));
const read = async (after: { id: string } | null) => rows.slice(after ? rows.findIndex((r) => r.id === after.id) + 1 : 0,
  (after ? rows.findIndex((r) => r.id === after.id) + 1 : 0) + 50);
test('cursor pagination traverses more than 500 players without gaps or duplicates', async () => {
  const ids: string[] = []; let cursor: string | null = null;
  do { const result = await readIndexedDiscoveryPage(query, cursor, 12, read, () => true); ids.push(...result.players.map((p) => p.id)); cursor = result.nextCursor; } while (cursor);
  assert.deepEqual(ids, rows.map((r) => r.id));
});
test('empty filtered batches advance with a continuation until a late match is found', async () => {
  let cursor: string | null = null; let requests = 0; const ids: string[] = [];
  do { const result = await readIndexedDiscoveryPage(query, cursor, 12, read, (p) => p.id === 'p0650');
    requests++; ids.push(...result.players.map((p) => p.id)); cursor = result.nextCursor;
    if (requests === 1) { assert.equal(result.players.length, 0); assert.equal(result.hasMore, true); }
  } while (cursor);
  assert.deepEqual(ids, ['p0650']); assert.equal(requests, 4);
});
test('query-bound cursors reject changed filters and malformed state', async () => {
  const first = await readIndexedDiscoveryPage(query, null, 12, read, () => true);
  await assert.rejects(readIndexedDiscoveryPage({ ...query, search: 'other' }, first.nextCursor, 12, read, () => true));
  for (const cursor of ['garbage', '{}', '[]']) await assert.rejects(readIndexedDiscoveryPage(query, cursor, 12, read, () => true));
});
test('equivalent filter object key order preserves cursor identity', async () => {
  const reordered = Object.fromEntries(Object.entries(defaultDiscoveryFilters).reverse()) as typeof defaultDiscoveryFilters;
  assert.equal(discoveryIndexQuery(query).identity, discoveryIndexQuery({ ...query, filters: reordered }).identity);
  const first = await readIndexedDiscoveryPage(query, null, 12, read, () => true);
  assert.ok((await readIndexedDiscoveryPage({ ...query, filters: reordered }, first.nextCursor, 12, read, () => true)).players.length);
});
test('value cursors continue after deletion instead of restarting at the first profile', async () => {
  const first = await readIndexedDiscoveryPage(query, null, 12, read, () => true);
  const remaining = rows.filter((r) => r.id !== 'p0011');
  const next = await readIndexedDiscoveryPage(query, first.nextCursor, 12, async (after) => remaining.filter((r) =>
    !after || r.order > after.order || (r.order === after.order && r.id > after.id)).slice(0, 50), () => true);
  assert.equal(next.players[0].id, 'p0012');
});
test('public prefix index is accent normalized, scoped and excludes private biography/phone/keywords', () => {
  const data = { fullName: 'Jos\u00e9 \u00c1lvarez', club: 'FC Z\u00fcrich', biography: 'private-marker', phone: '0791234567', searchKeywords: ['secretword'] };
  const index = buildDiscoverySearchIndex(data);
  assert.ok(index.tokens.includes('name:jose')); assert.ok(index.tokens.includes('all:zur'));
  for (const forbidden of ['private', '079', 'secretword']) assert.equal(JSON.stringify(index).includes(forbidden), false);
  assert.equal(indexedSearchMatches(data, 'jose zur', 'all'), true);
  assert.equal(indexedSearchMatches(data, 'jose zur', 'name'), false);
  assert.equal(indexedSearchMatches(data, 'ose', 'all'), false);
});
test('unknown sort values come last and metadata comparison ignores map property order', () => {
  const known = buildDiscoverySearchIndex({ age: 20, distanceKm: 1500, fullName: 'A', updatedAt: '2026-10-01' });
  const unknown = buildDiscoverySearchIndex({});
  for (const key of ['age', 'distance', 'name', 'recently_updated'] as const) assert.ok(known.order[key] < unknown.order[key]);
  assert.equal(sameDiscoverySearchIndex({ ...known, order: Object.fromEntries(Object.entries(known.order).reverse()) }, known), true);
  assert.equal(sameDiscoverySearchIndex({ ...known, tokens: [] }, known), false);
  assert.equal(sameDiscoverySearchIndex({ ...known, version: 0 }, known), false);
  assert.equal(SEARCH_SORTS.every((key) => typeof known.order[key] === 'string'), true);
  assert.equal(discoveryIndexQuery({ ...query, search: 'Lena E2E' }).token, 'all:lena');
});

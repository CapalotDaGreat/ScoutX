import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockDiscoverablePlayers } from '../../src/features/scout-discovery/services/mockPlayerDiscoveryData.ts';
import { defaultDiscoveryFilters, type DiscoverablePlayer, type DiscoverySearchScope } from '../../src/features/scout-discovery/types.ts';
import { filterAndSortPlayers, paginateDiscoveryPlayers, sortPlayers } from '../../src/features/scout-discovery/services/discoveryQueryService.ts';
import { matchesPlayerSearch, scorePlayerSearchRelevance } from '../../src/features/scout-discovery/services/smartDiscoveryService.ts';

function player(overrides: Partial<DiscoverablePlayer> = {}): DiscoverablePlayer {
  const base = mockDiscoverablePlayers[0];
  assert.ok(base);
  return { ...base, id: 'a', fullName: 'Jose Alvarez', username: 'jose', club: 'FC Zurich', league: 'Super League', nationality: 'Espana', position: ['CM'], searchKeywords: [], ...overrides };
}

test('normalized accent tokens match across fields, with AND semantics and scope isolation', () => {
  const p = player({ fullName: 'Jos\u00e9 A\u0301lvarez', club: 'FC Z\u00fcrich' });
  assert.equal(matchesPlayerSearch(p, '  JOSE   zurich  ', 'all'), true);
  assert.equal(matchesPlayerSearch(p, 'jose missing', 'all'), false);
  assert.equal(matchesPlayerSearch(p, 'jose zurich', 'name'), false);
  const scopes: [DiscoverySearchScope, string][] = [['name', 'alvarez jose'], ['club', 'zurich fc'], ['position', 'cm'], ['league', 'league super'], ['nationality', 'espana']];
  for (const [scope, query] of scopes) assert.equal(matchesPlayerSearch(p, query, scope), true);
  assert.equal(matchesPlayerSearch(p, '   ', 'club'), true);
  assert.equal(scorePlayerSearchRelevance(p, 'zurich', 'name').score, 0);
  assert.equal(filterAndSortPlayers([p], { search: 'jose zurich', searchScope: 'all', filters: defaultDiscoveryFilters, sort: 'relevance' }).length, 1);
});

test('nullable sorts put unknowns last and break ties deterministically without mutation', () => {
  const input = [player({ id: 'z', distanceKm: null }), player({ id: 'b', distanceKm: 1500 }), player({ id: 'a', distanceKm: 1500 })];
  assert.deepEqual(sortPlayers(input, 'distance').map((p) => p.id), ['a', 'b', 'z']);
  assert.deepEqual(input.map((p) => p.id), ['z', 'b', 'a']);
  for (const sort of ['age', 'sprint_speed', 'weak_foot', 'skill_moves'] as const) {
    assert.deepEqual(sortPlayers([player({ id: 'b', age: null, sprintSpeedKmh: null, weakFoot: null, skillMoves: null }), player({ id: 'a', age: 20, sprintSpeedKmh: 30, weakFoot: 3, skillMoves: 3 })], sort).map((p) => p.id), ['a', 'b']);
  }
  const dates = [player({ id: 'a', updatedAt: 'invalid' }), player({ id: 'z', updatedAt: '2026-10-01' })];
  assert.deepEqual(sortPlayers(dates, 'newest').map((p) => p.id), ['z', 'a']);
});

test('complete-set sorting precedes pagination; bounds and stale cursors fail explicitly', () => {
  const sorted = sortPlayers([player({ id: 'z', fullName: 'Zulu' }), player({ id: 'a', fullName: 'Alpha' })], 'name');
  const first = paginateDiscoveryPlayers(sorted, null, 1);
  assert.deepEqual(first.players.map((p) => p.id), ['a']);
  assert.equal(first.hasMore, true);
  const last = paginateDiscoveryPlayers(sorted, first.nextCursor, 1);
  assert.equal(last.hasMore, false);
  assert.equal(last.nextCursor, null);
  assert.throws(() => paginateDiscoveryPlayers(sorted, 'deleted', 1), /stale/);
  for (const size of [0, -1, 1.5, 501, NaN]) assert.throws(() => paginateDiscoveryPlayers(sorted, null, size), /size/);
});

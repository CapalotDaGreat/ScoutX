import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterAndSortPlayers,
  normalizeDiscoverySort,
  sortPlayers,
} from '../../src/features/scout-discovery/services/discoveryQueryService.ts';
import {
  defaultDiscoveryFilters,
  type DiscoverablePlayer,
} from '../../src/features/scout-discovery/types.ts';
import { buildPhysicalRows } from '../../src/features/player-comparison/services/comparisonMetricsService.ts';
import type { ComparisonPlayerProfile } from '../../src/features/player-comparison/types.ts';
import {
  addPlayerToWorkspace,
  createEmptyWorkspace,
  updateEntryNotes,
} from '../../src/features/scout-recruitment/models/RecruitmentModel.ts';

function player(overrides: Partial<DiscoverablePlayer> = {}): DiscoverablePlayer {
  return {
    id: 'p1',
    fullName: 'Player One',
    age: null,
    nationality: '',
    club: '',
    league: '',
    position: ['ST'],
    primaryPosition: 'ST',
    secondaryPositions: [],
    roleDescriptors: [],
    styleTags: [],
    preferredFoot: null,
    heightCm: null,
    weightKg: null,
    avatarUrl: '',
    coverImageUrl: '',
    biography: '',
    overallRating: null,
    overallRatingSource: null,
    potentialRating: null,
    potentialRatingSource: null,
    availability: null,
    verified: false,
    verificationLevel: 'none',
    weakFoot: null,
    skillMoves: null,
    matchCount: 0,
    analysisSampleCount: 0,
    recentlyActive: false,
    hasHighlightVideos: false,
    updatedAt: '2026-10-01T00:00:00.000Z',
    lastEvidenceAt: null,
    lastAnalyzedAt: null,
    viewCount: 0,
    goals: 0,
    assists: 0,
    sprintSpeedKmh: null,
    ratings: { passing: null, shooting: null, defending: null, physical: null },
    form: [],
    radarStats: [],
    evidenceCoverage: {
      technical: 'insufficient',
      tactical: 'insufficient',
      physical: 'insufficient',
      consistency: 'insufficient',
      video: 'insufficient',
    },
    metrics: {
      goals: { value: null, sampleSize: 0, provenance: null },
      assists: { value: null, sampleSize: 0, provenance: null },
      matchCount: { value: 0, sampleSize: 0, provenance: null },
      videoCount: { value: 0, sampleSize: 0, provenance: null },
    },
    distanceKm: null,
    clubHistory: [],
    achievements: [],
    searchKeywords: [],
    ...overrides,
  };
}

describe('discovery sort honesty', () => {
  test('legacy overall/potential sorts normalise to recently updated', () => {
    assert.equal(normalizeDiscoverySort('overall'), 'recently_updated');
    assert.equal(normalizeDiscoverySort('potential'), 'recently_updated');
    assert.equal(normalizeDiscoverySort('name'), 'name');
  });

  test('sorting by a legacy rating orders by recency, not a null composite', () => {
    const older = player({ id: 'older', updatedAt: '2026-09-01T00:00:00.000Z' });
    const newer = player({ id: 'newer', updatedAt: '2026-10-05T00:00:00.000Z' });
    assert.deepEqual(
      sortPlayers([older, newer], 'overall').map((item) => item.id),
      ['newer', 'older'],
    );
  });

  test('unknown values do not pass explicit numeric filters', () => {
    const unknownAge = player({ id: 'unknown-age', age: null });
    const knownAge = player({ id: 'known-age', age: 17 });
    const result = filterAndSortPlayers([unknownAge, knownAge], {
      search: '',
      searchScope: 'all',
      filters: { ...defaultDiscoveryFilters, ageMax: 18 },
      sort: 'recently_updated',
    });
    assert.deepEqual(result.map((item) => item.id), ['known-age']);
  });
});

describe('comparison missing values', () => {
  test('unknown GPS/sprint values stay unavailable without a numeric value', () => {
    const profile = (item: DiscoverablePlayer): ComparisonPlayerProfile => ({
      player: item,
      radarStats: [],
      performanceTrend: [],
      gps: null,
      videos: null,
      career: { playerId: item.id, clubs: [], achievements: [], journeyMilestones: null },
    });
    const profiles: ComparisonPlayerProfile[] = [
      profile(player({ id: 'a', sprintSpeedKmh: null })),
      profile(player({ id: 'b', sprintSpeedKmh: 31.2 })),
    ];
    const sprintRow = buildPhysicalRows(profiles).find((row) => row.key === 'sprint');
    assert.ok(sprintRow);
    assert.equal(sprintRow.values[0]?.display, '—');
    assert.equal(sprintRow.values[0]?.numeric, undefined);
    assert.equal(sprintRow.values[1]?.numeric, 31.2);
  });
});

describe('recruitment private notes', () => {
  test('notes update persists on the entry and leaves other entries untouched', () => {
    const empty = createEmptyWorkspace('scout-1');
    const withOne = addPlayerToWorkspace(empty, {
      playerId: 'p1',
      playerName: 'Player One',
      playerClub: 'FC Example',
      playerPosition: 'ST',
      playerAvatarUrl: '',
      playerOverallRating: null,
    });
    const updated = updateEntryNotes(withOne, 'p1', 'Strong first touch; recheck in spring.');
    assert.equal(updated.entries[0]?.notes, 'Strong first touch; recheck in spring.');
    assert.equal(withOne.entries[0]?.notes, '');
  });

  test('adding the same player twice does not duplicate the pipeline entry', () => {
    const snapshot = {
      playerId: 'p1',
      playerName: 'Player One',
      playerClub: 'FC Example',
      playerPosition: 'ST',
      playerAvatarUrl: '',
      playerOverallRating: null,
    };
    const once = addPlayerToWorkspace(createEmptyWorkspace('scout-1'), snapshot);
    const twice = addPlayerToWorkspace(once, snapshot);
    assert.equal(twice.entries.length, 1);
  });
});

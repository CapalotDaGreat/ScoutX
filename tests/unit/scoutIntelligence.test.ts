import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { migratePipelineStage, appendStageHistory } from '../../src/features/scout-intelligence/services/pipelineStageMigration.ts';
import { explainWhyThisPlayer } from '../../src/features/scout-intelligence/services/whyThisPlayer.ts';
import { rankSimilarPlayers, scoreSimilarPlayer } from '../../src/features/scout-intelligence/services/similarPlayers.ts';
import {
  comparisonSectionsForGroup,
  positionGroupFor,
  sharedPositionGroup,
  statisticKeysForGroup,
} from '../../src/features/scout-intelligence/services/positionComparison.ts';
import { buildComparisonProfile } from '../../src/features/player-comparison/services/comparisonProfileService.ts';
import { bestBriefMatch, evaluateBrief } from '../../src/features/scout-intelligence/services/briefMatch.ts';
import {
  defaultDiscoveryFilters,
  type DiscoverablePlayer,
  type DiscoveryFilters,
  type FilterPreset,
} from '../../src/features/scout-discovery/types.ts';

const EMPTY_EVIDENCE_COVERAGE: DiscoverablePlayer['evidenceCoverage'] = {
  technical: 'insufficient',
  tactical: 'insufficient',
  physical: 'insufficient',
  consistency: 'insufficient',
  video: 'insufficient',
};

function player(overrides: Partial<DiscoverablePlayer> & Pick<DiscoverablePlayer, 'id' | 'fullName'>): DiscoverablePlayer {
  return {
    age: null,
    nationality: 'Unknown',
    club: 'Free Agent',
    league: 'Amateur',
    position: ['ST'],
    primaryPosition: 'ST',
    secondaryPositions: [],
    roleDescriptors: [],
    styleTags: [],
    preferredFoot: 'right',
    heightCm: null,
    weightKg: null,
    avatarUrl: '',
    coverImageUrl: '',
    biography: '',
    overallRating: null,
    overallRatingSource: null,
    potentialRating: null,
    potentialRatingSource: null,
    availability: 'available',
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
    evidenceCoverage: { ...EMPTY_EVIDENCE_COVERAGE },
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

describe('pipeline stage migration', () => {
  test('maps legacy columns onto the seven honest stages', () => {
    assert.equal(migratePipelineStage('observed'), 'discovered');
    assert.equal(migratePipelineStage('invite_planned'), 'invited');
    assert.equal(migratePipelineStage('signed'), 'evaluated');
    assert.equal(migratePipelineStage('discovered'), 'discovered');
    assert.equal(migratePipelineStage('unknown'), 'discovered');
  });

  test('stage history does not duplicate the current stage', () => {
    const first = appendStageHistory([], 'discovered', 't1');
    const same = appendStageHistory(first, 'discovered', 't2');
    const moved = appendStageHistory(same, 'shortlisted', 't3');
    assert.equal(same.length, 1);
    assert.deepEqual(moved.map((item) => item.stage), ['discovered', 'shortlisted']);
  });
});

describe('why this player', () => {
  test('does not invent reasons from ratings or potential', () => {
    const reasons = explainWhyThisPlayer(
      player({
        id: 'p1',
        fullName: 'A',
        overallRating: 99,
        potentialRating: 99,
      }),
      { positions: ['CM'] },
    );
    assert.equal(reasons.length, 0);
  });

  test('cites recorded position, sample, video and verification only', () => {
    const reasons = explainWhyThisPlayer(
      player({
        id: 'p1',
        fullName: 'A',
        position: ['ST'],
        matchCount: 5,
        hasHighlightVideos: true,
        verified: true,
        verificationLevel: 'verified',
        lastEvidenceAt: '2026-10-01T00:00:00.000Z',
        evidenceCoverage: { ...EMPTY_EVIDENCE_COVERAGE, technical: 'moderate' },
        metrics: {
          goals: { value: 3, sampleSize: 5, provenance: 'match_derived' },
          assists: { value: 1, sampleSize: 5, provenance: 'match_derived' },
          matchCount: { value: 5, sampleSize: 5, provenance: 'match_derived' },
          videoCount: { value: 1, sampleSize: 1, provenance: 'self_reported' },
        },
      }),
      { positions: ['ST'], nowMs: Date.parse('2026-10-06T00:00:00.000Z') },
    );
    assert.deepEqual(
      reasons.map((reason) => reason.code).sort(),
      ['coverage', 'position', 'recent_evidence', 'sample_size', 'verified', 'video'].sort(),
    );
  });
});

describe('similar players', () => {
  test('scores overlap without using ratings', () => {
    const seed = player({ id: 'a', fullName: 'A', position: ['ST'], club: 'Ajax', styleTags: ['direct'] });
    const close = player({ id: 'b', fullName: 'B', position: ['ST'], club: 'Ajax', styleTags: ['direct'] });
    const far = player({ id: 'c', fullName: 'C', position: ['GK'], club: 'Other', styleTags: [] });
    assert.equal(scoreSimilarPlayer(seed, seed), null);
    const ranked = rankSimilarPlayers(seed, [close, far]);
    assert.equal(ranked[0]?.playerId, 'b');
    assert.ok((ranked[0]?.overlap ?? 0) > 0);
  });
});

describe('position-aware comparison', () => {
  test('goalkeepers do not get a shooting-oriented statistic set', () => {
    assert.equal(positionGroupFor(['GK']), 'goalkeeper');
    assert.deepEqual(statisticKeysForGroup('goalkeeper'), ['matches']);
    assert.ok(!comparisonSectionsForGroup('goalkeeper').includes('radar'));
    assert.equal(sharedPositionGroup([{ position: ['ST'] }, { position: ['GK'] }]), null);
  });
});

describe('scout brief', () => {
  test('returns insufficient evidence when nothing is recorded', () => {
    const reasons = explainWhyThisPlayer(player({ id: 'p1', fullName: 'A' }));
    assert.equal(reasons.length, 0);
  });
});

describe('brief match', () => {
  const brief = (filters: Partial<DiscoveryFilters>, id = 'mine'): FilterPreset => ({
    id,
    name: 'U19 left-footed winger',
    sort: 'relevance',
    filters: { ...defaultDiscoveryFilters, ...filters },
  });

  test('unstated facts are unknown, never a miss', () => {
    const p = player({ id: 'p', fullName: 'P', age: null, preferredFoot: null, position: ['LW'] });
    const criteria = evaluateBrief(p, brief({ ageMax: 19, preferredFoot: 'left', positions: ['LW', 'RW'] }).filters);
    assert.deepEqual(
      criteria.map((item) => [item.id, item.result]),
      [['age', 'unknown'], ['position', 'met'], ['foot', 'unknown']],
    );
  });

  test('explains why not with the wanted and actual values', () => {
    const p = player({ id: 'p', fullName: 'P', age: 23, preferredFoot: 'right' });
    const criteria = evaluateBrief(p, brief({ ageMin: 16, ageMax: 19, preferredFoot: 'left' }).filters);
    const age = criteria.find((item) => item.id === 'age');
    assert.equal(age?.result, 'not_met');
    assert.equal(age?.wanted, '16–19');
    assert.equal(age?.actual, '23');
    assert.equal(criteria.find((item) => item.id === 'foot')?.result, 'not_met');
  });

  test('a two-footed player satisfies a foot requirement', () => {
    const p = player({ id: 'p', fullName: 'P', preferredFoot: 'both' });
    assert.equal(evaluateBrief(p, brief({ preferredFoot: 'left' }).filters)[0].result, 'met');
  });

  test('ignores built-in example presets and empty briefs', () => {
    const p = player({ id: 'p', fullName: 'P' });
    assert.equal(bestBriefMatch(p, [brief({ ageMax: 21 }, 'preset-u21'), brief({}, 'empty')]), null);
  });

  test('picks the brief with the fewest misses', () => {
    const p = player({ id: 'p', fullName: 'P', age: 18, position: ['ST'] });
    const best = bestBriefMatch(p, [
      brief({ positions: ['GK'], ageMax: 19 }, 'keepers'),
      brief({ positions: ['ST'], ageMax: 19 }, 'strikers'),
    ]);
    assert.equal(best?.presetId, 'strikers');
    assert.equal(best?.met, 2);
    assert.equal(best?.notMet, 0);
  });
});

describe('comparison trend', () => {
  test('plots only recorded form points, never mixing other units', () => {
    const profile = buildComparisonProfile(
      player({ id: 'p1', fullName: 'A', form: ['W', 'L', 'D'], matchCount: 3, goals: 2, assists: 1 }),
    );
    assert.deepEqual(profile.performanceTrend, [
      { label: '1', values: { p1: 3 } },
      { label: '2', values: { p1: 0 } },
      { label: '3', values: { p1: 1 } },
    ]);
  });

  test('no recorded results means no trend points', () => {
    assert.deepEqual(buildComparisonProfile(player({ id: 'p2', fullName: 'B' })).performanceTrend, []);
  });
});

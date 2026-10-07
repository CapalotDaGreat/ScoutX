import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBrief, isFullBriefFit, bestBriefMatch } from '../../src/features/scout-intelligence/services/briefMatch.ts';
import {
  buildScoutAttention,
  buildScoutFirstSession,
  buildShortlistIntelligence,
  explainWhyNotThisPlayer,
  filterWatchlistEvents,
} from '../../src/features/scout-intelligence/services/scoutDecisionSupport.ts';
import {
  defaultDiscoveryFilters,
  type DiscoverablePlayer,
  type DiscoveryFilters,
  type FilterPreset,
} from '../../src/features/scout-discovery/types.ts';
import type { WatchlistEvent } from '../../src/features/scout-intelligence/types.ts';

const NOW = Date.parse('2026-10-07T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

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

const brief = (filters: Partial<DiscoveryFilters>, id = 'mine'): FilterPreset => ({
  id,
  name: 'My brief',
  sort: 'relevance',
  filters: { ...defaultDiscoveryFilters, ...filters },
});

function event(overrides: Partial<WatchlistEvent>): WatchlistEvent {
  return {
    id: 'e',
    scoutId: 's',
    playerId: 'p1',
    type: 'new_evidence',
    changes: [],
    fromStage: null,
    toStage: null,
    lastEvidenceAt: null,
    createdAt: '2026-10-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('brief 2.0 criteria', () => {
  test('role is unknown (not stated) when the player listed no roles', () => {
    const [role] = evaluateBrief(player(), brief({ roles: ['Ball-winner'] }).filters, NOW);
    assert.equal(role.id, 'role');
    assert.equal(role.result, 'unknown');
    assert.equal(role.missing, 'not_stated');
    assert.equal(role.confidence, 'self_reported');
  });

  test('role matches case-insensitively against role descriptors and style tags', () => {
    const p = player({ styleTags: ['ball-winner'] });
    assert.equal(evaluateBrief(p, brief({ roles: ['Ball-Winner'] }).filters, NOW)[0].result, 'met');
    assert.equal(evaluateBrief(p, brief({ roles: ['Target man'] }).filters, NOW)[0].result, 'not_met');
  });

  test('evidence freshness without a date is unknown with no_records, never a miss', () => {
    const [fresh] = evaluateBrief(player(), brief({ evidenceMaxAgeDays: 90 }).filters, NOW);
    assert.equal(fresh.result, 'unknown');
    assert.equal(fresh.missing, 'no_records');
    assert.equal(fresh.confidence, 'record');
  });

  test('evidence freshness compares the real record age', () => {
    const recent = player({ lastEvidenceAt: new Date(NOW - 10 * DAY).toISOString() });
    const stale = player({ lastEvidenceAt: new Date(NOW - 200 * DAY).toISOString() });
    assert.equal(evaluateBrief(recent, brief({ evidenceMaxAgeDays: 30 }).filters, NOW)[0].result, 'met');
    assert.equal(evaluateBrief(stale, brief({ evidenceMaxAgeDays: 30 }).filters, NOW)[0].result, 'not_met');
  });

  test('evidence coverage uses the weakest of technical, tactical and physical', () => {
    const p = player({
      evidenceCoverage: {
        technical: 'strong',
        tactical: 'moderate',
        physical: 'limited',
        consistency: 'strong',
        video: 'strong',
      },
    });
    assert.equal(evaluateBrief(p, brief({ minEvidenceCoverage: 'moderate' }).filters, NOW)[0].result, 'not_met');
  });

  test('identity facts are marked verified only after verification', () => {
    const filters = brief({ ageMax: 21 }).filters;
    assert.equal(evaluateBrief(player({ age: 19 }), filters, NOW)[0].confidence, 'self_reported');
    assert.equal(
      evaluateBrief(player({ age: 19, verificationLevel: 'verified' }), filters, NOW)[0].confidence,
      'verified',
    );
  });

  test('a full fit needs at least one met criterion and no misses', () => {
    const fit = bestBriefMatch(player({ styleTags: ['Ball-winner'] }), [brief({ roles: ['Ball-winner'] })], NOW);
    assert.equal(isFullBriefFit(fit), true);
    const unknownOnly = bestBriefMatch(player(), [brief({ roles: ['Ball-winner'] })], NOW);
    assert.equal(isFullBriefFit(unknownOnly), false);
  });
});

describe('why not this player', () => {
  test('thin profile lists missing evidence, not invented negatives', () => {
    const codes = explainWhyNotThisPlayer(player(), null, NOW).map((reason) => reason.code);
    assert.deepEqual(codes, ['insufficient_evidence', 'no_evidence_date', 'missing_video', 'not_verified', 'small_sample']);
  });

  test('outdated evidence reports the real age and brief misses are counted', () => {
    const p = player({
      lastEvidenceAt: new Date(NOW - 120 * DAY).toISOString(),
      hasHighlightVideos: true,
      verified: true,
      matchCount: 5,
      evidenceCoverage: {
        technical: 'strong',
        tactical: 'insufficient',
        physical: 'insufficient',
        consistency: 'insufficient',
        video: 'insufficient',
      },
      position: ['ST'],
      age: 25,
    });
    const match = bestBriefMatch(p, [brief({ positions: ['CB'], ageMax: 21 })], NOW);
    const reasons = explainWhyNotThisPlayer(p, match, NOW);
    assert.deepEqual(reasons, [
      { code: 'outdated_evidence', days: 120 },
      { code: 'role_mismatch' },
      { code: 'brief_misses', count: 1 },
    ]);
  });
});

describe('shortlist intelligence', () => {
  test('new evidence since the last review comes first', () => {
    const intel = buildShortlistIntelligence({
      player: player(),
      stage: 'contacted',
      lastReviewedAt: '2026-10-01T00:00:00.000Z',
      brief: null,
      events: [event({}), event({ id: 'old', createdAt: '2026-09-01T00:00:00.000Z' }), event({ playerId: 'other' })],
    });
    assert.equal(intel.changesSinceReview, 1);
    assert.equal(intel.nextAction, 'review_new_evidence');
  });

  test('no solid evidence suggests requesting evidence; stage drives the rest', () => {
    const thin = buildShortlistIntelligence({ player: player(), stage: 'contacted', lastReviewedAt: null, brief: null, events: [] });
    assert.equal(thin.strongest, null);
    assert.equal(thin.nextAction, 'request_evidence');
    assert.deepEqual(thin.biggestUncertainty, { kind: 'coverage', dimension: 'technical' });

    const solid = player({
      evidenceCoverage: {
        technical: 'insufficient',
        tactical: 'moderate',
        physical: 'insufficient',
        consistency: 'insufficient',
        video: 'insufficient',
      },
    });
    const intel = buildShortlistIntelligence({ player: solid, stage: 'contacted', lastReviewedAt: null, brief: null, events: [] });
    assert.deepEqual(intel.strongest, { dimension: 'tactical', state: 'moderate' });
    assert.equal(intel.nextAction, 'invite_trial');
  });
});

describe('watchlist filters', () => {
  const events = [
    event({ id: 'm', changes: ['match'] }),
    event({ id: 'v', changes: ['video'] }),
    event({ id: 'a', type: 'added' }),
    event({ id: 't', type: 'stage_changed', toStage: 'trial' }),
    event({ id: 'r', type: 'removed' }),
  ];
  test('each filter selects only matching events', () => {
    const ids = (filter: Parameters<typeof filterWatchlistEvents>[1]) =>
      filterWatchlistEvents(events, filter).map((item) => item.id);
    assert.deepEqual(ids('all'), ['m', 'v', 'a', 't', 'r']);
    assert.deepEqual(ids('match'), ['m']);
    assert.deepEqual(ids('video'), ['v']);
    assert.deepEqual(ids('pipeline'), ['a', 't']);
    assert.deepEqual(ids('trial'), ['t']);
    assert.deepEqual(ids('removed'), ['r']);
  });
});

describe('scout home', () => {
  test('attention lists only unseen items and upcoming trials within two weeks', () => {
    const items = buildScoutAttention(
      {
        fulfilledRequests: [
          { id: 'r1', playerId: 'p1', updatedAt: '2026-10-06T00:00:00.000Z' },
          { id: 'r0', playerId: 'p1', updatedAt: '2026-09-01T00:00:00.000Z' },
        ],
        trials: [
          { id: 't1', playerId: 'p2', playerName: 'B', status: 'accepted', scheduledDate: new Date(NOW + 3 * DAY).toISOString() },
          { id: 't2', playerId: 'p3', playerName: 'C', status: 'accepted', scheduledDate: new Date(NOW + 40 * DAY).toISOString() },
          { id: 't3', playerId: 'p4', playerName: 'D', status: 'cancelled', scheduledDate: new Date(NOW + 2 * DAY).toISOString() },
        ],
        events: [],
        briefFits: [],
        seenAt: '2026-10-01T00:00:00.000Z',
      },
      NOW,
    );
    assert.deepEqual(
      items.map((item) => `${item.kind}:${item.id}`),
      ['fulfilled_request:r1', 'upcoming_trial:t1'],
    );
  });

  test('first session reflects what the scout has actually done', () => {
    const steps = buildScoutFirstSession({ ownBriefCount: 1, viewedCount: 0, shortlistCount: 2, requestCount: 0, trialCount: 0 });
    assert.deepEqual(
      steps.filter((step) => step.done).map((step) => step.id),
      ['save_brief', 'shortlist_player'],
    );
  });
});

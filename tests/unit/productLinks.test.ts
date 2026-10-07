import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  footageMediaIdFor,
  segmentsFromCandidates,
} from '../../src/features/highlight-reel-studio/services/reelCandidateService.ts';
import type { HighlightCandidate } from '../../src/features/highlight-reel-studio/types.ts';
import {
  defaultDistanceUnit,
  formatDistance,
  formatSpeed,
  isDistanceUnit,
} from '../../src/features/gps/services/gpsSessionCalculator.ts';
import { buildPassportSummary } from '../../src/features/passport/services/passportSummaryService.ts';
import { defaultFootballIdentity } from '../../src/features/player-profile/types/footballIdentity.ts';
import { defaultPrivacySettings } from '../../src/features/player-profile/types/privacySettings.ts';
import type { PlayerProfile } from '../../src/features/player-profile/types.ts';
import type { PlayerMatchStatistics } from '../../src/features/player-statistics/types.ts';

function candidate(id: string, timestampSec: number, title = ''): HighlightCandidate {
  return {
    id,
    title,
    eventKind: 'matchAction',
    category: 'story',
    description: '',
    timestampSec,
    confidence: 0.6,
    highlightValue: 50,
    status: 'high-confidence',
    source: 'match-analysis',
    targetJersey: null,
    coverageBand: null,
  };
}

function profile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    id: 'p1',
    fullName: 'Test Player',
    position: 'AM',
    club: 'FC',
    nationality: '',
    preferredFoot: 'Right',
    height: '',
    weight: '',
    biography: '',
    coverImageUrl: '',
    avatarUrl: '',
    stats: [],
    performanceSummary: [],
    statisticsMatches: [],
    identity: defaultFootballIdentity,
    privacy: { ...defaultPrivacySettings(), publicPortfolioEnabled: true, discoverableByScouts: true },
    ...overrides,
  };
}

function match(id: string, date: string): PlayerMatchStatistics {
  return {
    id,
    date,
    opponent: 'FC',
    competition: 'League',
    result: 'W',
    minutes: 90,
    goals: 0,
    assists: 0,
    cleanSheet: false,
    passAccuracy: 80,
    shots: 1,
    tackles: 1,
    yellowCards: 0,
    redCards: 0,
    matchRating: 7,
    notes: '',
  };
}

describe('highlight candidates to reel segments', () => {
  test('cuts windows around each moment in match order on the footage item', () => {
    const segments = segmentsFromCandidates(
      [candidate('b', 600, 'Recovery'), candidate('a', 120, 'Pass')],
      footageMediaIdFor('job1'),
      null,
    );
    assert.deepEqual(segments, [
      { mediaId: 'footage_job1', inSec: 116, outSec: 126, caption: 'Pass', evidenceId: 'a' },
      { mediaId: 'footage_job1', inSec: 596, outSec: 606, caption: 'Recovery', evidenceId: 'b' },
    ]);
  });

  test('merges overlapping windows so footage is never repeated', () => {
    const segments = segmentsFromCandidates([candidate('a', 100), candidate('b', 105)], 'm', null);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].inSec, 96);
    assert.equal(segments[0].outSec, 111);
  });

  test('clamps to the start and to the measured duration and drops moments past the end', () => {
    const segments = segmentsFromCandidates([candidate('a', 2), candidate('b', 298), candidate('c', 400)], 'm', 300);
    assert.deepEqual(
      segments.map((item) => [item.inSec, item.outSec]),
      [
        [0, 8],
        [294, 300],
      ],
    );
  });
});

describe('discoverability health', () => {
  const now = new Date('2026-10-07T00:00:00Z');

  test('a minor without guardian scopes is hidden even with both settings on', () => {
    const summary = buildPassportSummary({
      profile: profile({ statisticsMatches: [match('m1', '2026-09-20')] }),
      safety: { isMinor: true, canUsePublicPassport: false, canBeDiscovered: false },
      now,
    });
    assert.equal(summary.discoverability.discoverable, false);
    assert.equal(summary.discoverability.publicPassport, false);
    assert.ok(summary.discoverability.blockers.includes('guardian_approval_needed'));
    assert.ok(!summary.discoverability.blockers.includes('public_passport_off'));
  });

  test('an approved minor with the scopes is treated like any other account', () => {
    const summary = buildPassportSummary({
      profile: profile({ statisticsMatches: [match('m1', '2026-09-20')] }),
      safety: { isMinor: true, canUsePublicPassport: true, canBeDiscovered: true },
      now,
    });
    assert.equal(summary.discoverability.discoverable, true);
    assert.ok(!summary.discoverability.blockers.includes('guardian_approval_needed'));
  });

  test('flags stale evidence and missing video from recorded data only', () => {
    const summary = buildPassportSummary({
      profile: profile({ statisticsMatches: [match('m1', '2026-03-01')] }),
      now,
    });
    assert.ok(summary.discoverability.blockers.includes('stale_evidence'));
    assert.ok(summary.discoverability.blockers.includes('no_video'));
    const fresh = buildPassportSummary({ profile: profile({ statisticsMatches: [match('m1', '2026-09-30')] }), now });
    assert.ok(!fresh.discoverability.blockers.includes('stale_evidence'));
  });
});

describe('distance units', () => {
  test('formats metric and imperial without changing stored metres', () => {
    assert.equal(formatDistance(5000), '5.00 km');
    assert.equal(formatDistance(800), '800 m');
    assert.equal(formatDistance(1609.344, 'mi'), '1.00 mi');
    assert.equal(formatDistance(100, 'mi'), '109 yd');
    assert.equal(formatSpeed(30), '30.0 km/h');
    assert.equal(formatSpeed(30, 'mi'), '18.6 mph');
  });

  test('defaults from the device measurement system and validates stored values', () => {
    assert.equal(defaultDistanceUnit('us'), 'mi');
    assert.equal(defaultDistanceUnit('uk'), 'mi');
    assert.equal(defaultDistanceUnit('metric'), 'km');
    assert.equal(defaultDistanceUnit(undefined), 'km');
    assert.equal(isDistanceUnit('mi'), true);
    assert.equal(isDistanceUnit('miles'), false);
  });
});

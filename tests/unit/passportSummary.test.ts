import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPassportSummary, coverageState } from '../../src/features/passport/services/passportSummaryService.ts';
import { defaultFootballIdentity } from '../../src/features/player-profile/types/footballIdentity.ts';
import { defaultPrivacySettings } from '../../src/features/player-profile/types/privacySettings.ts';
import type { PlayerProfile } from '../../src/features/player-profile/types.ts';
import type { PlayerMatchStatistics } from '../../src/features/player-statistics/types.ts';

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
    privacy: { ...defaultPrivacySettings(), publicPortfolioEnabled: false, discoverableByScouts: false },
    ...overrides,
  };
}

function match(id: string): PlayerMatchStatistics {
  return {
    id,
    date: '2026-09-01',
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

describe('passport summary', () => {
  test('coverage is insufficient with no matches and does not invent a percentage', () => {
    assert.equal(coverageState(0), 'insufficient');
    const summary = buildPassportSummary({ profile: profile(), now: new Date('2026-10-06') });
    assert.ok(summary.coverage.every((item) => item.id === 'video' || item.state === 'insufficient'));
    assert.equal(summary.matchCount, 0);
    assert.ok(summary.discoverability.blockers.includes('no_matches'));
    assert.ok(summary.discoverability.blockers.includes('public_passport_off'));
  });

  test('app-ops items are labelled separately from football evidence', () => {
    const summary = buildPassportSummary({
      profile: profile({ statisticsMatches: [match('m1')] }),
      pushRegistered: false,
      legalPagesReady: false,
    });
    const evidence = summary.readiness.filter((item) => item.group === 'evidence');
    const appOps = summary.readiness.filter((item) => item.group === 'app_ops');
    assert.ok(evidence.some((item) => item.id === 'matches' && item.status === 'partial'));
    assert.ok(appOps.every((item) => item.status === 'missing'));
    assert.ok(appOps.some((item) => item.reason.includes('not football evidence') || item.reason.includes('app-ops')));
  });

  test('proof stack only includes recorded artefacts', () => {
    const empty = buildPassportSummary({ profile: profile() });
    assert.deepEqual(empty.proof, []);
    const withMatch = buildPassportSummary({
      profile: profile({ statisticsMatches: [match('m1')] }),
    });
    assert.equal(withMatch.proof[0]?.id, 'match-m1');
    assert.equal(withMatch.proof[0]?.provenance, 'self_reported');
  });
});

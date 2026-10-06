import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { compareBeforeVsNow } from '../../src/features/development/services/developmentEngine.ts';
import {
  deriveGoalStatus,
  goalPercent,
  measureBaseline,
  measureGoal,
} from '../../src/features/development/services/developmentEngine.ts';
import { coverageFromSample, buildPlayerDna } from '../../src/features/development/services/developmentEngine.ts';
import { identityChanged, snapshotFromProfile } from '../../src/features/development/services/developmentEngine.ts';
import type { DevelopmentGoal } from '../../src/features/development/types.ts';
import type { PlayerMatchStatistics } from '../../src/features/player-statistics/types.ts';
import type { PlayerProfile } from '../../src/features/player-profile/types.ts';
import { defaultFootballIdentity } from '../../src/features/player-profile/types/footballIdentity.ts';

function match(overrides: Partial<PlayerMatchStatistics>): PlayerMatchStatistics {
  return {
    id: 'm',
    date: '2026-09-01',
    opponent: 'FC',
    competition: 'League',
    result: 'W 1-0',
    minutes: 90,
    goals: 0,
    assists: 0,
    cleanSheet: false,
    passAccuracy: 80,
    shots: 1,
    tackles: 2,
    yellowCards: 0,
    redCards: 0,
    matchRating: 7,
    notes: '',
    ...overrides,
  };
}

function goal(overrides: Partial<DevelopmentGoal>): DevelopmentGoal {
  return {
    id: 'g1',
    ownerId: 'p1',
    title: 'Goals',
    category: 'technical',
    metricKey: 'goals',
    positionRelevance: [],
    baseline: null,
    targetValue: 0.5,
    targetLabel: '',
    timeframeEnd: null,
    status: 'active',
    progress: [],
    linkedMatchIds: [],
    linkedTrainingIds: [],
    evidenceIds: [],
    practiceSuggestions: [],
    reflection: '',
    origin: 'manual',
    createdAt: '2026-09-15T00:00:00Z',
    updatedAt: '2026-09-15T00:00:00Z',
    achievedAt: null,
    ...overrides,
  };
}

describe('goal progress', () => {
  test('baseline uses only matches logged before the goal was created', () => {
    const measured = measureBaseline(goal({}), [
      match({ id: 'a', date: '2026-09-01', goals: 1 }),
      match({ id: 'b', date: '2026-09-10', goals: 2 }),
      match({ id: 'c', date: '2026-09-20', goals: 9 }),
    ]);
    assert.ok(measured);
    assert.equal(measured.value, 1.5);
    assert.equal(measured.sampleSize, 2);
  });

  test('current measurement ignores matches without the optional metric', () => {
    const measured = measureGoal(
      goal({ metricKey: 'passAccuracy', createdAt: '2026-09-01T00:00:00Z' }),
      [
        match({ id: 'a', date: '2026-09-02', passAccuracy: null }),
        match({ id: 'b', date: '2026-09-03', passAccuracy: 90 }),
        match({ id: 'c', date: '2026-09-04', passAccuracy: 80 }),
      ],
      new Date('2026-10-01'),
    );
    assert.ok(measured);
    assert.equal(measured.value, 85);
    assert.equal(measured.sampleSize, 2);
  });

  test('percent is null unless baseline, current and a distinct target all exist', () => {
    const g = goal({ baseline: { value: 0.2, sampleSize: 3, evidenceIds: [], measuredAt: 't' }, targetValue: 0.2 });
    assert.equal(goalPercent(g, { value: 0.4, sampleSize: 3, evidenceIds: [], measuredAt: 't' }), null);
    const withTarget = goal({
      baseline: { value: 0.2, sampleSize: 3, evidenceIds: [], measuredAt: 't' },
      targetValue: 0.6,
    });
    assert.equal(goalPercent(withTarget, { value: 0.4, sampleSize: 3, evidenceIds: [], measuredAt: 't' }), 50);
  });

  test('status is achieved when the measured value meets the target, revisit after the date', () => {
    const now = new Date('2026-10-06');
    assert.equal(
      deriveGoalStatus(goal({ targetValue: 1 }), { value: 1.2, sampleSize: 3, evidenceIds: [], measuredAt: 't' }, now),
      'achieved',
    );
    assert.equal(
      deriveGoalStatus(goal({ timeframeEnd: '2026-10-01', progress: [] }), null, now),
      'revisit',
    );
    assert.equal(deriveGoalStatus(goal({ progress: [] }), null, now), 'not_started');
  });
});

describe('before vs now', () => {
  test('insufficient until each window has three recorded values', () => {
    const matches = Array.from({ length: 5 }, (_, i) => match({ id: `m${i}`, date: `2026-09-0${i + 1}` }));
    const result = compareBeforeVsNow(matches, 'goals');
    assert.equal(result.state, 'insufficient');
    if (result.state === 'insufficient') {
      assert.equal(result.reason, 'not_enough_matches');
      assert.equal(result.required, 6);
    }
  });

  test('compares the last three matches against the three before them', () => {
    const matches = [
      match({ id: '1', date: '2026-09-01', goals: 0 }),
      match({ id: '2', date: '2026-09-02', goals: 0 }),
      match({ id: '3', date: '2026-09-03', goals: 0 }),
      match({ id: '4', date: '2026-09-04', goals: 1 }),
      match({ id: '5', date: '2026-09-05', goals: 1 }),
      match({ id: '6', date: '2026-09-06', goals: 1 }),
    ];
    const result = compareBeforeVsNow(matches, 'goals');
    assert.equal(result.state, 'available');
    if (result.state === 'available') {
      assert.equal(result.before.value, 0);
      assert.equal(result.now.value, 1);
      assert.equal(result.improved, true);
      assert.equal(result.provenance, 'match_derived');
    }
  });

  test('optional metrics with nulls stay insufficient instead of treating them as zero', () => {
    const matches = Array.from({ length: 6 }, (_, i) =>
      match({ id: `m${i}`, date: `2026-09-0${i + 1}`, passAccuracy: i < 4 ? null : 80 }),
    );
    const result = compareBeforeVsNow(matches, 'passAccuracy');
    assert.equal(result.state, 'insufficient');
    if (result.state === 'insufficient') {
      assert.equal(result.reason, 'metric_not_recorded');
    }
  });
});

describe('player DNA and identity', () => {
  test('coverage follows sample-size thresholds and never invents a value from an empty set', () => {
    assert.equal(coverageFromSample(0), 'insufficient');
    assert.equal(coverageFromSample(1), 'limited');
    assert.equal(coverageFromSample(4), 'moderate');
    assert.equal(coverageFromSample(8), 'strong');
    const empty = buildPlayerDna([]);
    assert.ok(empty.every((trait) => trait.value === null && trait.state === 'insufficient'));
  });

  test('identity snapshots only record a change when a field actually differs', () => {
    const profile = {
      id: 'p1',
      position: 'AM',
      club: 'FC',
      identity: { ...defaultFootballIdentity, preferredPlayingStyle: 'possession', strongFoot: 'right' as const },
    } as Pick<PlayerProfile, 'id' | 'position' | 'club' | 'identity'>;
    const first = { id: 's1', ...snapshotFromProfile(profile, new Date('2026-01-01')) };
    assert.equal(identityChanged(first, snapshotFromProfile(profile, new Date('2026-02-01'))), false);
    assert.equal(
      identityChanged(first, snapshotFromProfile({ ...profile, club: 'Other' }, new Date('2026-02-01'))),
      true,
    );
  });
});

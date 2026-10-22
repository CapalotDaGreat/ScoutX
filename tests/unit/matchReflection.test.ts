import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMatchReflection,
  parseMatchReflection,
  serializeMatchStatistics,
} from '../../src/features/player-statistics/models/MatchLogModel.ts';
import type { PlayerMatchStatistics } from '../../src/features/player-statistics/types.ts';
import { buildTodayPlan } from '../../src/features/today/services/nextBestActionService.ts';
import type { TodayInput } from '../../src/features/today/types.ts';

const NOW = new Date('2026-10-06T12:00:00Z');

function match(overrides: Partial<PlayerMatchStatistics> = {}): PlayerMatchStatistics {
  return {
    id: 'm1',
    date: '2026-10-04',
    opponent: 'FC Example',
    competition: 'League',
    result: 'W 2-1',
    minutes: 80,
    goals: 1,
    assists: 0,
    cleanSheet: false,
    passAccuracy: null,
    shots: null,
    tackles: null,
    yellowCards: 0,
    redCards: 0,
    matchRating: null,
    notes: '',
    reflection: null,
    ...overrides,
  };
}

function input(overrides: Partial<TodayInput> = {}): TodayInput {
  return {
    now: NOW,
    matches: [],
    analyses: [],
    analysesLoaded: true,
    trials: [],
    videos: [],
    passportSteps: [],
    reviewedAnalysisIds: [],
    matchDraft: null,
    goals: [],
    trainingSessions: [],
    recentlyCompletedTypes: [],
    ...overrides,
  };
}

describe('match reflection model', () => {
  test('builds a trimmed reflection and returns null when everything is blank', () => {
    assert.deepEqual(buildMatchReflection('  First touch held up ', '', ' Scan earlier '), {
      wentWell: 'First touch held up',
      difficult: '',
      nextPriority: 'Scan earlier',
    });
    assert.equal(buildMatchReflection(' ', '', ''), null);
  });

  test('parses only string fields from untrusted data', () => {
    assert.equal(parseMatchReflection(null), null);
    assert.equal(parseMatchReflection('nope'), null);
    assert.equal(parseMatchReflection({ wentWell: 42 }), null);
    assert.deepEqual(
      parseMatchReflection({ wentWell: 'Pressing', difficult: 'Switches', nextPriority: '' }),
      { wentWell: 'Pressing', difficult: 'Switches', nextPriority: '' },
    );
  });

  test('reflection round-trips through serialisation and parsing', () => {
    const reflection = { wentWell: 'Runs in behind', difficult: 'Left-side link-up', nextPriority: 'Weaker-foot passing' };
    const serialized = serializeMatchStatistics(match({ reflection }));
    assert.deepEqual(serialized.reflection, reflection);
    assert.deepEqual(parseMatchReflection(serialized.reflection), reflection);
  });

  test('matches without a reflection serialise without the field', () => {
    const serialized = serializeMatchStatistics(match());
    assert.equal('reflection' in serialized, false);
    assert.equal(parseMatchReflection(serialized.reflection), null);
  });
});

describe('today reflection prompt', () => {
  test('a recent unreflected match prompts a reflection', () => {
    const plan = buildTodayPlan(
      input({ matches: [{ id: 'm1', date: '2026-10-04', opponent: 'FC Example', hasReflection: false }] }),
    );
    assert.equal(plan.primary?.type, 'reflect_match');
    assert.equal(plan.primary?.route, 'matchReflection');
  });

  test('no prompt when the match is reflected, old, or reflection state is unknown', () => {
    const reflected = buildTodayPlan(
      input({ matches: [{ id: 'm1', date: '2026-10-04', opponent: 'FC Example', hasReflection: true }] }),
    );
    assert.notEqual(reflected.primary?.type, 'reflect_match');

    const unknown = buildTodayPlan(
      input({ matches: [{ id: 'm1', date: '2026-10-04', opponent: 'FC Example' }] }),
    );
    assert.notEqual(unknown.primary?.type, 'reflect_match');

    const stale = buildTodayPlan(
      input({ matches: [{ id: 'm1', date: '2026-09-01', opponent: 'FC Example', hasReflection: false }] }),
    );
    assert.notEqual(stale.primary?.type, 'reflect_match');
  });

  test('an earlier reflection priority is carried into the next prompt', () => {
    const plan = buildTodayPlan(
      input({
        matches: [
          { id: 'm2', date: '2026-10-04', opponent: 'FC New', hasReflection: false },
          {
            id: 'm1',
            date: '2026-09-27',
            opponent: 'FC Old',
            hasReflection: true,
            reflectionPriority: 'Scan before receiving',
          },
        ],
      }),
    );
    assert.equal(plan.primary?.type, 'reflect_match');
    assert.equal(plan.primary?.params.previousPriority, 'Scan before receiving');
  });
});

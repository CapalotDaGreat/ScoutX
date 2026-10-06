import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQuickMatchDefaults,
  defaultMatchLogFormState,
  formatMatchResult,
  hasMeaningfulMatchInput,
  parseMatchLogFormState,
  parseMatchResult,
  recentCompetitions,
  validateMatchLogForm,
} from '../../src/features/player-statistics/models/MatchLogModel.ts';
import type { PlayerMatchStatistics } from '../../src/features/player-statistics/types.ts';

const NOW = new Date('2026-10-06T12:00:00');

function match(overrides: Partial<PlayerMatchStatistics>): PlayerMatchStatistics {
  return {
    id: 'm',
    date: '2026-09-01',
    opponent: 'FC Example',
    competition: 'League',
    result: 'W 2-1',
    minutes: 90,
    goals: 1,
    assists: 0,
    cleanSheet: false,
    passAccuracy: 84,
    shots: 3,
    tackles: 2,
    yellowCards: 0,
    redCards: 0,
    matchRating: 7.5,
    notes: '',
    ...overrides,
  };
}

const essentials = {
  ...defaultMatchLogFormState,
  date: '2026-10-05',
  opponent: 'Rivals FC',
  competition: 'League',
  minutes: '90',
};

describe('Quick Match defaults', () => {
  test('a first-time player gets no invented performance values', () => {
    const defaults = buildQuickMatchDefaults([], '', NOW);
    assert.equal(defaults.date, '2026-10-06');
    assert.equal(defaults.minutes, '');
    assert.equal(defaults.matchRating, '');
    assert.equal(defaults.passAccuracy, '');
  });

  test('defaults reuse only the latest competition, position and minutes', () => {
    const defaults = buildQuickMatchDefaults(
      [
        match({ id: 'old', date: '2026-08-01', competition: 'Cup', minutes: 45 }),
        match({ id: 'new', date: '2026-09-20', competition: 'League', minutes: 70, position: 'RW' }),
      ],
      'CM',
      NOW,
    );
    assert.equal(defaults.competition, 'League');
    assert.equal(defaults.position, 'RW');
    assert.equal(defaults.minutes, '70');
    assert.equal(defaults.goals, '0');
    assert.equal(defaults.matchRating, '');
  });

  test('recent competitions are distinct and newest first', () => {
    const names = recentCompetitions([
      match({ date: '2026-09-01', competition: 'League' }),
      match({ date: '2026-09-10', competition: 'Cup' }),
      match({ date: '2026-09-15', competition: 'league' }),
    ]);
    assert.deepEqual(names, ['league', 'Cup']);
  });
});

describe('Quick Match result helpers', () => {
  test('outcome and score round-trip', () => {
    assert.equal(formatMatchResult('W', '2-1'), 'W 2-1');
    assert.equal(formatMatchResult(null, '1-1'), '1-1');
    assert.deepEqual(parseMatchResult('L 0-3'), { outcome: 'L', score: '0-3' });
    assert.deepEqual(parseMatchResult('3-3'), { outcome: null, score: '3-3' });
  });
});

describe('Quick Match validation', () => {
  test('the six essentials are enough; empty optional stats stay unrecorded', () => {
    const result = validateMatchLogForm(essentials, NOW);
    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.payload.passAccuracy, null);
      assert.equal(result.payload.matchRating, null);
      assert.equal(result.payload.minutes, 90);
    }
  });

  test('missing essentials produce translatable error codes', () => {
    const cases = [
      [{ opponent: '' }, 'opponent_required'],
      [{ competition: '' }, 'competition_required'],
      [{ minutes: '' }, 'minutes_required'],
      [{ date: '06.10.2026' }, 'date_invalid'],
      [{ date: '2026-12-01' }, 'date_future'],
    ] as const;
    for (const [overrides, code] of cases) {
      const result = validateMatchLogForm({ ...essentials, ...overrides }, NOW);
      assert.equal(result.valid, false);
      if (!result.valid) {
        assert.equal(result.error.code, code);
      }
    }
  });

  test('out-of-range values report the field and bounds', () => {
    const result = validateMatchLogForm({ ...essentials, matchRating: '11' }, NOW);
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.deepEqual(result.error, { code: 'out_of_range', field: 'matchRating', min: 1, max: 10 });
    }
  });
});

describe('Quick Match drafts', () => {
  test('only real input counts as a draft', () => {
    const baseline = buildQuickMatchDefaults([], '', NOW);
    assert.equal(hasMeaningfulMatchInput(baseline, baseline), false);
    assert.equal(hasMeaningfulMatchInput({ ...baseline, date: '2026-10-05' }, baseline), false);
    assert.equal(hasMeaningfulMatchInput({ ...baseline, opponent: 'Rivals' }, baseline), true);
  });

  test('stored drafts with wrong field types are rejected', () => {
    assert.deepEqual(parseMatchLogFormState(essentials), essentials);
    assert.equal(parseMatchLogFormState({ ...essentials, minutes: 90 }), null);
    assert.equal(parseMatchLogFormState('nope'), null);
  });
});

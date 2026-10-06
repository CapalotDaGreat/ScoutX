import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultFootballIdentity,
  isLegacySeededIdentity,
  stripLegacyIdentitySeed,
} from '../../src/features/player-profile/types/footballIdentity.ts';
import {
  defaultMatchLogFormState,
  validateMatchLogForm,
} from '../../src/features/player-statistics/models/MatchLogModel.ts';
import { buildPlayerDna } from '../../src/features/development/services/developmentEngine.ts';
import type { PlayerMatchStatistics } from '../../src/features/player-statistics/types.ts';

const legacySeed = {
  currentClub: 'Free Agent',
  strongFoot: 'right',
  weakFootRating: 3,
  skillMovesRating: 3,
  availability: 'available',
  transferStatus: 'open_to_offers',
  contractStatus: 'free_agent',
  academicStatus: 'not_applicable',
};

function match(overrides: Partial<PlayerMatchStatistics> = {}): PlayerMatchStatistics {
  return {
    id: 'm1',
    date: '2026-09-01',
    opponent: 'FC Test',
    competition: 'League',
    result: 'W 1-0',
    minutes: 90,
    goals: 0,
    assists: 0,
    cleanSheet: false,
    passAccuracy: null,
    shots: null,
    tackles: null,
    yellowCards: 0,
    redCards: 0,
    matchRating: null,
    notes: '',
    ...overrides,
  };
}

describe('Football identity defaults', () => {
  test('a new identity states no football facts', () => {
    assert.equal(defaultFootballIdentity.strongFoot, null);
    assert.equal(defaultFootballIdentity.weakFootRating, null);
    assert.equal(defaultFootballIdentity.skillMovesRating, null);
    assert.equal(defaultFootballIdentity.availability, null);
    assert.equal(defaultFootballIdentity.transferStatus, null);
    assert.equal(defaultFootballIdentity.contractStatus, null);
    assert.equal(defaultFootballIdentity.academicStatus, null);
    assert.equal(defaultFootballIdentity.currentClub, '');
    assert.deepEqual(defaultFootballIdentity.preferredPositions, []);
  });

  test('the exact legacy seed is recognised and stripped', () => {
    assert.equal(isLegacySeededIdentity(legacySeed), true);
    const stripped = stripLegacyIdentitySeed(legacySeed);
    assert.equal(stripped.strongFoot, null);
    assert.equal(stripped.weakFootRating, null);
    assert.equal(stripped.availability, null);
    assert.equal(stripped.transferStatus, null);
    assert.equal(stripped.currentClub, '');
  });

  test('any player-edited value keeps the whole record as stated', () => {
    const edited = { ...legacySeed, weakFootRating: 4 };
    assert.equal(isLegacySeededIdentity(edited), false);
    assert.equal(stripLegacyIdentitySeed(edited), edited);
  });
});

describe('Match statistics are never assumed', () => {
  test('a new match form does not prefill shots or tackles', () => {
    assert.equal(defaultMatchLogFormState.shots, '');
    assert.equal(defaultMatchLogFormState.tackles, '');
  });

  test('blank shots/tackles are saved as not recorded, explicit zero stays zero', () => {
    const base = {
      ...defaultMatchLogFormState,
      date: '2026-09-01',
      opponent: 'FC Test',
      competition: 'League',
      minutes: '90',
    };
    const blank = validateMatchLogForm(base, new Date('2026-09-02'));
    assert.equal(blank.valid, true);
    if (blank.valid) {
      assert.equal(blank.payload.shots, null);
      assert.equal(blank.payload.tackles, null);
    }
    const zero = validateMatchLogForm({ ...base, shots: '0', tackles: '0' }, new Date('2026-09-02'));
    assert.equal(zero.valid, true);
    if (zero.valid) {
      assert.equal(zero.payload.shots, 0);
      assert.equal(zero.payload.tackles, 0);
    }
  });

  test('defensive DNA only samples matches with recorded tackles', () => {
    const dna = buildPlayerDna([
      match({ id: 'a', tackles: 4 }),
      match({ id: 'b', tackles: null }),
      match({ id: 'c', tackles: 2 }),
    ]);
    const defensive = dna.find((trait) => trait.id === 'defensive_presence');
    assert.ok(defensive);
    assert.equal(defensive.sampleSize, 2);
    assert.equal(defensive.value, 3);
  });

  test('goal threat is plain goals per match, not a weighted invented formula', () => {
    const dna = buildPlayerDna([match({ goals: 1, shots: 8 }), match({ id: 'b', goals: 0, shots: 4 })]);
    const threat = dna.find((trait) => trait.id === 'goal_threat');
    assert.equal(threat?.value, 0.5);
  });
});

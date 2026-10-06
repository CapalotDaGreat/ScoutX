import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextStarSelection,
  starGlyphs,
  starLevelKey,
  toStarRating,
} from '../../src/utils/starRating.ts';
import {
  compareWithSelfRating,
  parseTechniqueAssessment,
} from '../../src/features/match-analysis/services/techniqueAssessment.ts';

describe('star ratings', () => {
  test('only whole stars from 1 to 5 are valid; everything else is unknown', () => {
    assert.equal(toStarRating(3), 3);
    assert.equal(toStarRating(4.4), 4);
    assert.equal(toStarRating(0), null);
    assert.equal(toStarRating(6), null);
    assert.equal(toStarRating(null), null);
    assert.equal(toStarRating('5'), null);
    assert.equal(toStarRating(Number.NaN), null);
  });

  test('glyphs show filled and empty stars, unknown is a dash', () => {
    assert.equal(starGlyphs(1), '★☆☆☆☆');
    assert.equal(starGlyphs(5), '★★★★★');
    assert.equal(starGlyphs(null), '—');
  });

  test('tapping the selected star clears it, other taps select', () => {
    assert.equal(nextStarSelection(null, 3), 3);
    assert.equal(nextStarSelection(3, 5), 5);
    assert.equal(nextStarSelection(3, 3), null);
    assert.equal(nextStarSelection(2, 9), 2);
  });

  test('level keys map each star count to stable copy keys', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map(starLevelKey), ['one', 'two', 'three', 'four', 'five']);
  });
});

describe('technique assessment parsing', () => {
  const stored = {
    scale: 'stars_1_5',
    basis: 'sampled_frames',
    ratedCount: 2,
    overallSummary: 'Good touch, weaker left foot.',
    selfReported: { strongFoot: 'right', weakFoot: 4, skillMoves: 3 },
    ratings: [
      { dimension: 'weakFoot', stars: 2, status: 'rated', summary: 'Short passes only', tip: 'Wall passes', frameIds: ['f1', 'f2'] },
      { dimension: 'skillMoves', stars: 3, status: 'rated', summary: 'Step-over', tip: null, frameIds: ['f1', 'f3'] },
      { dimension: 'passing', stars: 9, status: 'rated', summary: 'bad', frameIds: ['f1', 'f2'] },
    ],
  };

  test('older reports without an assessment stay null', () => {
    assert.equal(parseTechniqueAssessment(undefined), null);
    assert.equal(parseTechniqueAssessment({ ratings: 'nope' }), null);
  });

  test('missing or malformed ratings degrade to insufficient evidence, never a score', () => {
    const assessment = parseTechniqueAssessment(stored);
    assert.ok(assessment);
    assert.equal(assessment.ratings.length, 6);
    const passing = assessment.ratings.find((rating) => rating.dimension === 'passing');
    assert.equal(passing?.stars, null);
    assert.equal(passing?.status, 'insufficient_evidence');
    const shooting = assessment.ratings.find((rating) => rating.dimension === 'shooting');
    assert.equal(shooting?.stars, null);
    assert.equal(assessment.ratedCount, 2);
  });

  test('compares the footage with the player self-rating', () => {
    const assessment = parseTechniqueAssessment(stored);
    assert.ok(assessment);
    assert.deepEqual(compareWithSelfRating(assessment, 'weakFoot'), {
      self: 4,
      footage: 2,
      result: 'footage_lower',
    });
    assert.deepEqual(compareWithSelfRating(assessment, 'skillMoves'), {
      self: 3,
      footage: 3,
      result: 'matches',
    });
    const noSelf = parseTechniqueAssessment({ ...stored, selfReported: {} });
    assert.ok(noSelf);
    assert.equal(compareWithSelfRating(noSelf, 'weakFoot'), null);
  });
});

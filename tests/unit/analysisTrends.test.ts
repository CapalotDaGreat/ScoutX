import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalysisTrends, TREND_MIN_ANALYSES } from '../../src/features/match-analysis/services/analysisTrends.ts';
import type { MatchAnalysisJob, TechniqueRating } from '../../src/features/match-analysis/types.ts';

function rating(dimension: TechniqueRating['dimension'], stars: number | null): TechniqueRating {
  return { dimension, stars, status: stars === null ? 'insufficient_evidence' : 'rated', summary: '', tip: null, frameIds: [], confidence: 'Limited' };
}

function job(id: string, date: string, ratings: TechniqueRating[], overrides: Partial<MatchAnalysisJob> = {}): MatchAnalysisJob {
  return {
    id,
    playerId: 'p',
    status: 'complete',
    createdAt: `${date}T10:00:00.000Z`,
    match: { opponent: 'X', competition: 'L', date },
    identityConfirmation: { state: 'confirmed', frameIds: ['frame_0'] },
    analysisMode: 'MATCH_CLIP',
    report: {
      analysisMode: 'MATCH_CLIP',
      techniqueAssessment: { scale: 'stars_1_5', basis: 'sampled_frames', ratings, ratedCount: ratings.length, overallSummary: '', selfReported: { strongFoot: null, weakFoot: null, skillMoves: null } },
    },
    ...overrides,
  } as unknown as MatchAnalysisJob;
}

describe('analysis trends', () => {
  test(`stay locked below ${TREND_MIN_ANALYSES} comparable analyses`, () => {
    const two = [job('a', '2026-09-01', [rating('passing', 3)]), job('b', '2026-09-08', [rating('passing', 4)])];
    assert.deepEqual(buildAnalysisTrends(two), { state: 'locked', kind: 'match', completed: 2, required: 3 });
    assert.equal(buildAnalysisTrends([]).state, 'locked');
  });

  test('ignore unconfirmed, unfinished or incompatible analyses', () => {
    const jobs = [
      job('a', '2026-09-01', [rating('passing', 3)]),
      job('b', '2026-09-08', [rating('passing', 4)]),
      job('c', '2026-09-15', [rating('passing', 5)], { identityConfirmation: { state: 'pending' } as MatchAnalysisJob['identityConfirmation'] }),
      job('d', '2026-09-16', [rating('passing', 5)], { status: 'failed' }),
      job('e', '2026-09-17', [rating('passing', 5)], { analysisMode: 'SHORT_CLIP', report: { ...job('x', '2026-09-17', [rating('passing', 5)]).report!, analysisMode: 'SHORT_CLIP' } }),
    ];
    const trends = buildAnalysisTrends(jobs);
    assert.equal(trends.state, 'locked');
    assert.equal(trends.completed, 2, 'a short clip is not compared with match footage');
  });

  test('unknown ratings stay unknown, never zero, and need enough measured points', () => {
    const jobs = [
      job('c', '2026-09-15', [rating('passing', 4), rating('shooting', null)]),
      job('a', '2026-09-01', [rating('passing', 2), rating('shooting', 3)]),
      job('b', '2026-09-08', [rating('passing', 3)]),
    ];
    const trends = buildAnalysisTrends(jobs);
    assert.equal(trends.state, 'available');
    if (trends.state !== 'available') return;
    const passing = trends.series.find((series) => series.metric === 'passing');
    assert.deepEqual(passing?.points.map((point) => point.value), [2, 3, 4], 'ordered by match date');
    assert.equal(passing?.source, 'ai_derived');
    assert.equal(passing?.first, 2);
    assert.equal(passing?.latest, 4);
    assert.equal(trends.series.some((series) => series.metric === 'shooting'), false);
    assert.ok(trends.unknownMetrics.includes('shooting'));
    assert.ok(trends.series.every((series) => series.points.every((point) => point.value !== 0)));
  });
});

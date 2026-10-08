import type { AnalysisMode } from './analysisMode';
import type { MatchAnalysisJob, TechniqueDimension } from '../types';

/**
 * Trends across a player's own video analyses. Deliberately conservative:
 *  - nothing is shown before TREND_MIN_ANALYSES completed analyses with a confirmed identity;
 *  - three points are a description of those analyses, not a statistically reliable trend;
 *  - only analyses of the same kind (short clip vs. match) on the same rating scale are compared;
 *  - a dimension that was not rated is unknown (null), never zero, and does not count as a point;
 *  - every series carries its source; video ratings are AI-derived from sampled frames.
 */
export const TREND_MIN_ANALYSES = 3;

export type TrendSource = 'ai_derived' | 'player_entered' | 'coach' | 'verified';

export type TrendPoint = { jobId: string; date: string; value: number | null };

export type TrendSeries = {
  metric: TechniqueDimension;
  source: TrendSource;
  points: TrendPoint[];
  /** Points with a measured value; the series is shown only when this reaches the minimum. */
  measured: number;
  first: number | null;
  latest: number | null;
};

export type TrendKind = 'clip' | 'match';

export type AnalysisTrends =
  | { state: 'locked'; kind: TrendKind | null; completed: number; required: number }
  | { state: 'available'; kind: TrendKind; completed: number; required: number; series: TrendSeries[]; unknownMetrics: TechniqueDimension[] };

const DIMENSIONS: TechniqueDimension[] = ['firstTouch', 'passing', 'dribbling', 'shooting', 'weakFoot', 'skillMoves'];

function kindOf(mode: AnalysisMode | undefined): TrendKind {
  return mode === 'SHORT_CLIP' || mode === 'TRAINING_CLIP' ? 'clip' : 'match';
}

function eligible(job: MatchAnalysisJob): boolean {
  const assessment = job.report?.techniqueAssessment;
  return (
    job.status === 'complete' &&
    job.identityConfirmation?.state === 'confirmed' &&
    assessment?.scale === 'stars_1_5' &&
    assessment.basis === 'sampled_frames'
  );
}

export function buildAnalysisTrends(jobs: readonly MatchAnalysisJob[]): AnalysisTrends {
  const usable = jobs.filter(eligible);
  // Compare like with like: the kind with the most usable analyses, newest first in the input.
  const byKind = new Map<TrendKind, MatchAnalysisJob[]>();
  for (const job of usable) {
    const kind = kindOf(job.report?.analysisMode ?? job.analysisMode);
    byKind.set(kind, [...(byKind.get(kind) ?? []), job]);
  }
  const [kind, group] = [...byKind.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? [null, []];
  if (!kind || group.length < TREND_MIN_ANALYSES) {
    return { state: 'locked', kind, completed: group.length, required: TREND_MIN_ANALYSES };
  }

  const ordered = [...group].sort((a, b) => (a.match.date || a.createdAt).localeCompare(b.match.date || b.createdAt));
  const series: TrendSeries[] = [];
  const unknownMetrics: TechniqueDimension[] = [];
  for (const metric of DIMENSIONS) {
    const points = ordered.map((job): TrendPoint => {
      const rating = job.report?.techniqueAssessment?.ratings.find((item) => item.dimension === metric);
      const value = rating?.status === 'rated' && typeof rating.stars === 'number' ? rating.stars : null;
      return { jobId: job.id, date: job.match.date || job.createdAt.slice(0, 10), value };
    });
    const measured = points.filter((point) => point.value !== null);
    if (measured.length < TREND_MIN_ANALYSES) {
      unknownMetrics.push(metric);
      continue;
    }
    series.push({
      metric,
      source: 'ai_derived',
      points,
      measured: measured.length,
      first: measured[0].value,
      latest: measured[measured.length - 1].value,
    });
  }
  return { state: 'available', kind, completed: group.length, required: TREND_MIN_ANALYSES, series, unknownMetrics };
}

import type { CoverageState } from '@/features/development/types';
import type { PlayerMatchStatistics } from '@/features/player-statistics/types';
import type {
  CoverageDimension,
  NextBestEvidence,
} from '@/features/intelligence/types';

const DAY_MS = 24 * 60 * 60 * 1000;
export const RECENCY_DAYS = 30;
const MIN_RECORDED_FOR_DIMENSION = 3;

const RANK: Record<CoverageState, number> = { insufficient: 0, limited: 1, moderate: 2, strong: 3 };

export type NextBestEvidenceInput = {
  matches: readonly PlayerMatchStatistics[];
  coverage: Partial<Record<CoverageDimension, CoverageState>>;
  completedAnalysisCount: number;
  videoCount: number;
  coachEndorsementCount: number;
  gpsSessionCount: number;
  now: Date;
};

function strongest(
  coverage: NextBestEvidenceInput['coverage'],
): CoverageDimension | null {
  let best: CoverageDimension | null = null;
  let bestRank = 1;
  for (const [dimension, state] of Object.entries(coverage) as Array<[CoverageDimension, CoverageState]>) {
    if (RANK[state] > bestRank) {
      best = dimension;
      bestRank = RANK[state];
    }
  }
  return best;
}

/**
 * The single piece of evidence that would most improve how complete and credible the
 * player's record is. Ordered by value: existence → recency → video → analysis → missing
 * recorded dimensions → independent reference → physical data.
 */
export function nextBestEvidence(input: NextBestEvidenceInput): NextBestEvidence | null {
  const strongestDimension = strongest(input.coverage);
  const base = { strongestDimension };

  if (input.matches.length === 0) {
    return { ...base, kind: 'first_match', dimension: 'consistency', params: {} };
  }

  const latest = [...input.matches].sort((a, b) => b.date.localeCompare(a.date))[0];
  const daysSince = Math.floor((input.now.getTime() - Date.parse(latest.date)) / DAY_MS);
  if (Number.isFinite(daysSince) && daysSince > RECENCY_DAYS) {
    return { ...base, kind: 'recent_match', dimension: 'recency', params: { days: daysSince } };
  }

  if (input.videoCount === 0) {
    return { ...base, kind: 'match_video', dimension: 'video', params: {} };
  }

  if (input.completedAnalysisCount === 0) {
    return { ...base, kind: 'match_analysis', dimension: 'tactical', params: {} };
  }

  const passing = input.matches.filter((match) => match.passAccuracy !== null).length;
  if (passing < MIN_RECORDED_FOR_DIMENSION) {
    return {
      ...base,
      kind: 'record_passing',
      dimension: 'tactical',
      params: { have: passing, need: MIN_RECORDED_FOR_DIMENSION },
    };
  }

  const defending = input.matches.filter((match) => match.tackles !== null).length;
  if (defending < MIN_RECORDED_FOR_DIMENSION) {
    return {
      ...base,
      kind: 'record_defending',
      dimension: 'technical',
      params: { have: defending, need: MIN_RECORDED_FOR_DIMENSION },
    };
  }

  if (input.coachEndorsementCount === 0) {
    return { ...base, kind: 'coach_reference', dimension: 'verification', params: {} };
  }

  if (input.gpsSessionCount === 0) {
    return { ...base, kind: 'gps_session', dimension: 'physical', params: {} };
  }

  return null;
}

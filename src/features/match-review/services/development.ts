/**
 * "Am I improving over time?" - compares only observations that are actually comparable:
 * full (not preliminary) reports, the same engine generation, and enough confirmed footage of the
 * player in BOTH matches. Anything else is listed as not comparable, with the reason.
 */
import type { TrackingDoc } from '@/features/match-analysis/services/trackingPresentation';

export const MIN_CONFIRMED_SEC = 600; // 10 minutes of confirmed identity per match

export type MatchObservation = {
  jobId: string;
  date: string;
  engineMajor: string;
  scope: 'preliminary' | 'full';
  confirmedSec: number;
  analysedSec: number;
  confirmedActions: number;
  completedPasses: number;
  passAttempts: number;
};

export type NotComparableReason = 'partial_report' | 'engine_changed' | 'low_confirmed_coverage';

export function observationFrom(jobId: string, date: string, doc: TrackingDoc | null): MatchObservation | null {
  const r = doc?.report;
  if (!r) return null;
  const moments = r.moments ?? [];
  const confirmedActions = moments.filter((m) => m.identityState === 'CONFIRMED_VISIBLE' && !m.candidate && m.kind !== 'spell' && m.kind !== 'sighting').length;
  const passes = moments.filter((m) => m.kind === 'pass_attempt' && !m.candidate);
  return { jobId, date, engineMajor: r.engineVersion.split('.')[0] ?? r.engineVersion, scope: doc?.scope ?? 'full',
    confirmedSec: r.coverage.confirmedVisibleSec, analysedSec: r.coverage.analysedSec, confirmedActions,
    completedPasses: passes.filter((m) => m.outcome === 'completed').length, passAttempts: passes.length };
}

export function comparability(a: MatchObservation, b: MatchObservation): NotComparableReason | null {
  if (a.scope !== 'full' || b.scope !== 'full') return 'partial_report';
  if (a.engineMajor !== b.engineMajor) return 'engine_changed';
  if (a.confirmedSec < MIN_CONFIRMED_SEC || b.confirmedSec < MIN_CONFIRMED_SEC) return 'low_confirmed_coverage';
  return null;
}

export type DevelopmentTrend = {
  /** actions per 10 confirmed minutes, oldest first, only comparable matches */
  points: Array<{ jobId: string; date: string; actionsPer10: number }>;
  excluded: Array<{ jobId: string; reason: NotComparableReason }>;
};

/**
 * Builds the trend relative to the latest observation. Fewer than two comparable matches means
 * no trend is shown at all (the UI explains why).
 */
export function developmentTrend(observations: MatchObservation[]): DevelopmentTrend {
  const sorted = [...observations].sort((x, y) => x.date.localeCompare(y.date));
  const latest = sorted[sorted.length - 1];
  const excluded: DevelopmentTrend['excluded'] = [];
  const points: DevelopmentTrend['points'] = [];
  if (!latest) return { points, excluded };
  for (const o of sorted) {
    const reason = o === latest ? comparability(o, o) : comparability(o, latest);
    if (reason) {
      excluded.push({ jobId: o.jobId, reason });
      continue;
    }
    points.push({ jobId: o.jobId, date: o.date, actionsPer10: Math.round((o.confirmedActions / (o.confirmedSec / 600)) * 10) / 10 });
  }
  return { points: points.length >= 2 ? points : [], excluded };
}

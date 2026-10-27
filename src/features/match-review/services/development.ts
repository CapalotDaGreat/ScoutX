/**
 * "Am I improving over time?" - compares only observations that are actually comparable:
 * full (not preliminary) reports, the same engine generation, and enough confirmed footage of the
 * player in BOTH matches. Anything else is listed as not comparable, with the reason.
 */
import type { TrackingDoc, TrackingReport } from '@/features/match-analysis/services/trackingPresentation';
import type { CoachTopic } from './coach';
import { buildMomentsView } from './moments';

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

/**
 * 5.0 next-match focus follow-up. A goal saved from a coaching insight carries its topic as an
 * evidence tag (`coach-topic:<topic>`). In a LATER match the review says whether this recording
 * contains evidence about that topic and links it - it never judges success or failure, and says
 * plainly when the footage cannot show it.
 */
export const COACH_TOPIC_PREFIX = 'coach-topic:';

export type FocusGoal = { id: string; title: string; evidenceIds?: string[] };
export type FocusFollowUp = {
  goalId: string; title: string; topic: CoachTopic;
  status: 'evidence' | 'insufficient';
  momentIds: string[]; clips: Array<{ start: number; end: number }>;
  params: Record<string, number>;
};

export function goalTopic(goal: FocusGoal): CoachTopic | null {
  const tag = (goal.evidenceIds ?? []).find((e) => e.startsWith(COACH_TOPIC_PREFIX));
  return tag ? (tag.slice(COACH_TOPIC_PREFIX.length) as CoachTopic) : null;
}

export function focusFollowUps(goals: FocusGoal[], jobId: string, report: TrackingReport | null): FocusFollowUp[] {
  if (!report) return [];
  const view = buildMomentsView(report);
  const confirmed = view.moments.filter((m) => m.evidence === 'confirmed');
  const out: FocusFollowUp[] = [];
  for (const g of goals) {
    const topic = goalTopic(g);
    // only goals saved from ANOTHER match: this match's own insight is not a follow-up
    if (!topic || (g.evidenceIds ?? []).some((e) => e.startsWith(`${jobId}:`))) continue;
    const base = { goalId: g.id, title: g.title, topic, momentIds: [] as string[], clips: [] as FocusFollowUp['clips'], params: {} };
    if (topic === 'positioning') {
      const seqs = (report.offball?.sequences ?? []).filter((q) => q.kind === 'free' || q.kind === 'tight');
      const measured = report.offball?.status === 'measured';
      out.push(measured || seqs.length
        ? { ...base, status: 'evidence', clips: seqs.slice(0, 3).map((q) => ({ start: q.start, end: q.end })), params: { count: seqs.length } }
        : { ...base, status: 'insufficient', params: { confirmedSec: Math.round(report.coverage.confirmedVisibleSec) } });
      continue;
    }
    const pick = topic === 'passing' || topic === 'passing_accuracy' ? confirmed.filter((m) => m.titleKey === 'pass_attempt')
      : topic === 'carrying' ? confirmed.filter((m) => m.titleKey === 'carry')
        : topic === 'involvement' ? confirmed.filter((m) => m.category === 'on_ball' || m.category === 'passing') : [];
    out.push(pick.length > 0
      ? { ...base, status: 'evidence', momentIds: pick.slice(0, 5).map((m) => m.id), params: { count: pick.length } }
      : { ...base, status: 'insufficient', params: { confirmedSec: Math.round(report.coverage.confirmedVisibleSec) } });
  }
  return out.slice(0, 3);
}

import type { CareerMoment } from '@/features/career-story/types';

export type CareerMomentSource = {
  matches?: ReadonlyArray<{ id: string; date: string; opponent: string; result: string; goals?: number | null; assists?: number | null }>;
  trials?: ReadonlyArray<{ id: string; status: string; scheduledDate: string; club: string }>;
  journey?: ReadonlyArray<{ id: string; title: string; date: string; subtitle?: string | null }>;
  milestones?: ReadonlyArray<{ id: string; title: string; earnedAt: string }>;
  goals?: ReadonlyArray<{ id: string; title: string; createdAt: string; status: string }>;
};

/**
 * Career moments are only emitted from recorded artefacts. No invented titles,
 * dates, or achievements.
 */
export function buildCareerMoments(source: CareerMomentSource): CareerMoment[] {
  const moments: CareerMoment[] = [];

  for (const match of source.matches ?? []) {
    const parts = [match.result, match.opponent].filter(Boolean);
    moments.push({
      id: `match-${match.id}`,
      kind: 'match',
      title: `Match vs ${match.opponent}`,
      detail: parts.join(' · ') || null,
      occurredAt: match.date,
      sourceId: match.id,
    });
  }

  for (const trial of source.trials ?? []) {
    moments.push({
      id: `trial-${trial.id}`,
      kind: 'trial',
      title: `Trial · ${trial.club}`,
      detail: trial.status,
      occurredAt: trial.scheduledDate,
      sourceId: trial.id,
    });
  }

  for (const entry of source.journey ?? []) {
    moments.push({
      id: `journey-${entry.id}`,
      kind: 'journey',
      title: entry.title,
      detail: entry.subtitle ?? null,
      occurredAt: entry.date,
      sourceId: entry.id,
    });
  }

  for (const milestone of source.milestones ?? []) {
    moments.push({
      id: `milestone-${milestone.id}`,
      kind: 'milestone',
      title: milestone.title,
      detail: null,
      occurredAt: milestone.earnedAt,
      sourceId: milestone.id,
    });
  }

  for (const goal of source.goals ?? []) {
    moments.push({
      id: `goal-${goal.id}`,
      kind: 'goal',
      title: goal.title,
      detail: goal.status,
      occurredAt: goal.createdAt,
      sourceId: goal.id,
    });
  }

  return moments.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

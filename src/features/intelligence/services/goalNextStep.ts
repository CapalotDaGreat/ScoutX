import type { GoalProgressSummary, TrainingSession } from '@/features/development/types';
import type { PlayerMatchStatistics } from '@/features/player-statistics/types';
import type { GoalNextStep } from '@/features/intelligence/types';

const DAY_MS = 24 * 60 * 60 * 1000;
export const GOAL_WINDOW = 3;
const TRAINING_GAP_DAYS = 7;

export type GoalNextStepContext = {
  matches: readonly PlayerMatchStatistics[];
  trainingSessions: readonly Pick<TrainingSession, 'id' | 'date' | 'goalIds'>[];
  /** True when the player has a coach connection who could review this goal. */
  hasCoachConnection: boolean;
  now: Date;
};

function recorded(match: PlayerMatchStatistics, key: GoalProgressSummary['goal']['metricKey']): boolean {
  switch (key) {
    case 'shots':
      return match.shots !== null;
    case 'tackles':
      return match.tackles !== null;
    case 'passAccuracy':
      return match.passAccuracy !== null;
    case 'matchRating':
      return match.matchRating !== null;
    default:
      return true;
  }
}

/**
 * Picks the single most useful next action for a development goal. The order mirrors the
 * development loop: prove → revisit → measure → practise → play → compare → adapt.
 */
export function goalNextStep(summary: GoalProgressSummary, context: GoalNextStepContext): GoalNextStep {
  const { goal, status, current } = summary;
  const since = goal.createdAt.slice(0, 10);
  const matchesSince = context.matches.filter((match) => match.date.slice(0, 10) >= since);
  const linkedTraining = context.trainingSessions
    .filter((session) => session.goalIds.includes(goal.id))
    .sort((a, b) => b.date.localeCompare(a.date));
  const lastTrainingDays = linkedTraining[0]
    ? Math.floor((context.now.getTime() - Date.parse(linkedTraining[0].date)) / DAY_MS)
    : null;

  if (status === 'achieved') {
    return { kind: 'prove_achievement', params: { title: goal.title } };
  }
  if (status === 'revisit') {
    return { kind: 'revisit_goal', params: { title: goal.title } };
  }

  if (goal.metricKey !== 'none') {
    const recordedSince = matchesSince.filter((match) => recorded(match, goal.metricKey));
    if (matchesSince.length > 0 && recordedSince.length === 0) {
      return { kind: 'record_metric', params: { metric: goal.metricKey, matches: matchesSince.length } };
    }
    if (!current) {
      return { kind: 'log_match_to_measure', params: { metric: goal.metricKey } };
    }
    if (current.sampleSize < GOAL_WINDOW) {
      return {
        kind: 'play_more_matches',
        params: { have: current.sampleSize, need: GOAL_WINDOW, metric: goal.metricKey },
      };
    }
    if (!goal.baseline) {
      // Measured since the goal started, but there is nothing earlier to compare against.
      return { kind: 'baseline_missing', params: { metric: goal.metricKey } };
    }
    // Every goal metric is higher-is-better (see METRIC_DIRECTION in the development engine).
    if (current.value <= goal.baseline.value) {
      // A full window without movement: keep the goal, change how it is practised.
      return context.hasCoachConnection
        ? { kind: 'ask_coach', params: { title: goal.title, matches: current.sampleSize } }
        : { kind: 'shift_focus', params: { title: goal.title, matches: current.sampleSize } };
    }
  }

  if (lastTrainingDays === null || lastTrainingDays >= TRAINING_GAP_DAYS) {
    return {
      kind: 'log_training',
      params: { title: goal.title, days: lastTrainingDays ?? -1 },
    };
  }

  if (goal.metricKey === 'none' && goal.progress.length === 0) {
    return { kind: 'reflect', params: { title: goal.title } };
  }

  return { kind: 'keep_going', params: { title: goal.title } };
}

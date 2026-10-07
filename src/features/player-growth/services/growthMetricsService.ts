import { type PlayerProfile } from '@/features/player-profile/types';
import { calculatePlayerStatistics } from '@/features/player-statistics/services/statisticsCalculator';

export type GrowthMetric = {
  /** Null when nothing was recorded for this metric in the last 7 days. */
  current: number | null;
  /** Null when the previous week has no comparable data. */
  delta: string | null;
  direction: 'up' | 'down' | 'neutral';
};

export type WeeklyGrowthMetrics = {
  matchCount: number;
  goals: GrowthMetric;
  assists: GrowthMetric;
  passAccuracy: GrowthMetric;
  tackles: GrowthMetric;
};

function splitMatchesByPeriod(matches: NonNullable<PlayerProfile['statisticsMatches']>) {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const recent = matches.filter((match) => now - new Date(match.date).getTime() <= weekMs);
  const previous = matches.filter((match) => {
    const age = now - new Date(match.date).getTime();
    return age > weekMs && age <= weekMs * 2;
  });
  return { recent, previous };
}

function formatDelta(current: number | null, previous: number | null): string | null {
  if (current === null || previous === null || previous === 0) {
    return null;
  }
  const delta = Math.round(((current - previous) / previous) * 100);
  if (delta === 0) {
    return '0%';
  }
  return delta > 0 ? `+${delta}%` : `${delta}%`;
}

function directionFromDelta(delta: string | null): GrowthMetric['direction'] {
  if (delta === null) {
    return 'neutral';
  }
  if (delta.startsWith('+')) {
    return 'up';
  }
  if (delta.startsWith('-')) {
    return 'down';
  }
  return 'neutral';
}

type GrowthKey = 'goals' | 'assists' | 'passAccuracy' | 'tackles';

function hasRecorded(matches: NonNullable<PlayerProfile['statisticsMatches']>, key: GrowthKey): boolean {
  if (key === 'passAccuracy') return matches.some((match) => match.passAccuracy !== null);
  if (key === 'tackles') return matches.some((match) => match.tackles !== null);
  return matches.length > 0;
}

export function buildWeeklyGrowthMetrics(profile: PlayerProfile): WeeklyGrowthMetrics {
  const matches = profile.statisticsMatches ?? [];
  const { recent, previous } = splitMatchesByPeriod(matches);
  const recentStats = calculatePlayerStatistics(recent);
  const previousStats = calculatePlayerStatistics(previous);

  const metric = (key: GrowthKey): GrowthMetric => {
    const current = recentStats.totals.find((item) => item.key === key)?.value;
    const prior = previousStats.totals.find((item) => item.key === key)?.value;
    const currentValue = hasRecorded(recent, key) && typeof current === 'number' ? current : null;
    const priorValue = hasRecorded(previous, key) && typeof prior === 'number' ? prior : null;
    const delta = formatDelta(currentValue, priorValue);
    return {
      current: currentValue,
      delta,
      direction: directionFromDelta(delta),
    };
  };

  return {
    matchCount: recent.length,
    goals: metric('goals'),
    assists: metric('assists'),
    passAccuracy: metric('passAccuracy'),
    tackles: metric('tackles'),
  };
}

export function filterMatchesInCurrentWeek(matches: NonNullable<PlayerProfile['statisticsMatches']>) {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return matches.filter((match) => now - new Date(match.date).getTime() <= weekMs);
}

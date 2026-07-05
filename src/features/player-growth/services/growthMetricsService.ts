import { type PlayerProfile } from '@/features/player-profile/types';
import { calculatePlayerStatistics } from '@/features/player-statistics/services/statisticsCalculator';

export type GrowthMetric = {
  current: number;
  delta: string;
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

function formatDelta(current: number, previous: number): string {
  if (previous === 0) {
    return current > 0 ? '+100%' : '—';
  }
  const delta = Math.round(((current - previous) / previous) * 100);
  if (delta === 0) {
    return '0%';
  }
  return delta > 0 ? `+${delta}%` : `${delta}%`;
}

function directionFromDelta(delta: string): GrowthMetric['direction'] {
  if (delta.startsWith('+')) {
    return 'up';
  }
  if (delta.startsWith('-')) {
    return 'down';
  }
  return 'neutral';
}

export function buildWeeklyGrowthMetrics(profile: PlayerProfile): WeeklyGrowthMetrics {
  const matches = profile.statisticsMatches ?? [];
  const { recent, previous } = splitMatchesByPeriod(matches);
  const recentStats = calculatePlayerStatistics(recent);
  const previousStats = calculatePlayerStatistics(previous);

  const metric = (key: string): GrowthMetric => {
    const current = recentStats.totals.find((item) => item.key === key)?.value ?? 0;
    const prior = previousStats.totals.find((item) => item.key === key)?.value ?? 0;
    const currentValue = typeof current === 'number' ? current : 0;
    const priorValue = typeof prior === 'number' ? prior : 0;
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

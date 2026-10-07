import { type PlayerProfileStat } from '@/features/player-profile/types';
import { calculatePlayerStatistics } from '@/features/player-statistics/services/statisticsCalculator';
import {
  type PlayerMatchStatistics,
  type StatisticMetricKey,
  type StatisticTrend,
} from '@/features/player-statistics/types';

function toChange(trend: StatisticTrend) {
  return { baseline: trend.baseline, delta: trend.delta, formattedDelta: trend.formattedDelta };
}
import { averageOfRecorded } from '@/features/player-statistics/utils/recordedStats';

const profileHighlightKeys: StatisticMetricKey[] = [
  'goals',
  'assists',
  'passAccuracy',
  'tackles',
];

export function mapMatchesToProfileStats(
  matches: PlayerMatchStatistics[],
): PlayerProfileStat[] {
  const overview = calculatePlayerStatistics(matches);

  return profileHighlightKeys.map((key) => {
    const summary = overview.totals.find((item) => item.key === key);

    return {
      label: summary?.label ?? key,
      value: summary && summary.recordedCount > 0 ? summary.formattedValue : '—',
      metric: key,
      trend: {
        value: summary?.trend.value ?? 'No change',
        direction: summary?.trend.direction ?? 'neutral',
        ...(summary ? { change: toChange(summary.trend) } : {}),
      },
    };
  });
}

/** Mockup-style row: Matches · Goals · Assists · Avg Rating */
export function mapMatchesToHomeQuickStats(
  matches: PlayerMatchStatistics[],
): PlayerProfileStat[] {
  const overview = calculatePlayerStatistics(matches);
  const goals = overview.totals.find((item) => item.key === 'goals');
  const assists = overview.totals.find((item) => item.key === 'assists');
  const avgRating = averageOfRecorded(matches, 'matchRating') ?? 0;

  return [
    {
      label: 'Matches',
      metric: 'matches',
      value: String(overview.matchCount),
      trend: { value: '', direction: 'neutral' },
    },
    {
      label: 'Goals',
      metric: 'goals',
      value: goals?.formattedValue ?? '0',
      trend: goals
        ? { value: goals.trend.value, direction: goals.trend.direction, change: toChange(goals.trend) }
        : { value: '', direction: 'neutral' },
    },
    {
      label: 'Assists',
      metric: 'assists',
      value: assists?.formattedValue ?? '0',
      trend: assists
        ? { value: assists.trend.value, direction: assists.trend.direction, change: toChange(assists.trend) }
        : { value: '', direction: 'neutral' },
    },
    {
      label: 'Avg Rating',
      metric: 'avgRating',
      value: avgRating > 0 ? avgRating.toFixed(1) : '—',
      trend: { value: '', direction: 'neutral' },
    },
  ];
}

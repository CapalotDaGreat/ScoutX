import { type PlayerProfileStat } from '@/features/player-profile/types';
import { calculatePlayerStatistics } from '@/features/player-statistics/services/statisticsCalculator';
import {
  type PlayerMatchStatistics,
  type StatisticMetricKey,
} from '@/features/player-statistics/types';
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
      value: summary?.formattedValue ?? '0',
      trend: {
        value: summary?.trend.value ?? 'No change',
        direction: summary?.trend.direction ?? 'neutral',
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
      value: String(overview.matchCount),
      trend: { value: '', direction: 'neutral' },
    },
    {
      label: 'Goals',
      value: goals?.formattedValue ?? '0',
      trend: goals?.trend ?? { value: '', direction: 'neutral' },
    },
    {
      label: 'Assists',
      value: assists?.formattedValue ?? '0',
      trend: assists?.trend ?? { value: '', direction: 'neutral' },
    },
    {
      label: 'Avg Rating',
      value: avgRating > 0 ? avgRating.toFixed(1) : '—',
      trend: { value: '', direction: 'neutral' },
    },
  ];
}

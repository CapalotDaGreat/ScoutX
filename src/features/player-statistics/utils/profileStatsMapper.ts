import { type PlayerProfileStat } from '@/features/player-profile/types';
import { calculatePlayerStatistics } from '@/features/player-statistics/services/statisticsCalculator';
import {
  type PlayerMatchStatistics,
  type StatisticMetricKey,
} from '@/features/player-statistics/types';

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

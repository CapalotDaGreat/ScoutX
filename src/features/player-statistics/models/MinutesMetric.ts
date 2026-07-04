import { BaseStatisticMetric } from '@/features/player-statistics/models/base/BaseStatisticMetric';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';

export class MinutesMetric extends BaseStatisticMetric {
  readonly key = 'minutes' as const;

  readonly definition = {
    key: this.key,
    label: 'Minutes',
    shortLabel: 'Min',
    category: 'availability' as const,
    higherIsBetter: true,
    maxRadarValue: 900,
  };

  getMatchValue(match: PlayerMatchStatistics): number {
    return match.minutes;
  }
}

export const minutesMetric = new MinutesMetric();

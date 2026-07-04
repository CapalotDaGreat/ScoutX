import { BaseStatisticMetric } from '@/features/player-statistics/models/base/BaseStatisticMetric';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';

export class AssistsMetric extends BaseStatisticMetric {
  readonly key = 'assists' as const;

  readonly definition = {
    key: this.key,
    label: 'Assists',
    shortLabel: 'A',
    category: 'attacking' as const,
    higherIsBetter: true,
    maxRadarValue: 16,
  };

  getMatchValue(match: PlayerMatchStatistics): number {
    return match.assists;
  }
}

export const assistsMetric = new AssistsMetric();

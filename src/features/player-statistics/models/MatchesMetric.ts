import { BaseStatisticMetric } from '@/features/player-statistics/models/base/BaseStatisticMetric';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';

export class MatchesMetric extends BaseStatisticMetric {
  readonly key = 'matches' as const;

  readonly definition = {
    key: this.key,
    label: 'Matches',
    shortLabel: 'M',
    category: 'availability' as const,
    higherIsBetter: true,
    maxRadarValue: 10,
  };

  getMatchValue(match: PlayerMatchStatistics): number {
    return match.minutes > 0 ? 1 : 0;
  }

  override getAverage(matches: PlayerMatchStatistics[]): number {
    return this.getTotal(matches);
  }

  override getAverageLabel(): string {
    return 'Appearances';
  }
}

export const matchesMetric = new MatchesMetric();

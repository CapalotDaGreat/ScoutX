import { BaseStatisticMetric } from '@/features/player-statistics/models/base/BaseStatisticMetric';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';

export class ShotsMetric extends BaseStatisticMetric {
  readonly key = 'shots' as const;

  readonly definition = {
    key: this.key,
    label: 'Shots',
    shortLabel: 'Sh',
    category: 'attacking' as const,
    higherIsBetter: true,
    maxRadarValue: 35,
  };

  getMatchValue(match: PlayerMatchStatistics): number {
    return match.shots ?? 0;
  }

  override hasMatchValue(match: PlayerMatchStatistics): boolean {
    return match.shots !== null;
  }
}

export const shotsMetric = new ShotsMetric();

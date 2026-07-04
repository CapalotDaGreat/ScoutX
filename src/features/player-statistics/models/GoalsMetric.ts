import { BaseStatisticMetric } from '@/features/player-statistics/models/base/BaseStatisticMetric';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';

export class GoalsMetric extends BaseStatisticMetric {
  readonly key = 'goals' as const;

  readonly definition = {
    key: this.key,
    label: 'Goals',
    shortLabel: 'G',
    category: 'attacking' as const,
    higherIsBetter: true,
    maxRadarValue: 20,
  };

  getMatchValue(match: PlayerMatchStatistics): number {
    return match.goals;
  }
}

export const goalsMetric = new GoalsMetric();

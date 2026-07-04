import { BaseStatisticMetric } from '@/features/player-statistics/models/base/BaseStatisticMetric';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';

export class TacklesMetric extends BaseStatisticMetric {
  readonly key = 'tackles' as const;

  readonly definition = {
    key: this.key,
    label: 'Tackles',
    shortLabel: 'Tk',
    category: 'defending' as const,
    higherIsBetter: true,
    maxRadarValue: 40,
  };

  getMatchValue(match: PlayerMatchStatistics): number {
    return match.tackles;
  }
}

export const tacklesMetric = new TacklesMetric();

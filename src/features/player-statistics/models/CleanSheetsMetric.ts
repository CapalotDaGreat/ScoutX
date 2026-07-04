import { BaseStatisticMetric } from '@/features/player-statistics/models/base/BaseStatisticMetric';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';

export class CleanSheetsMetric extends BaseStatisticMetric {
  readonly key = 'cleanSheets' as const;

  readonly definition = {
    key: this.key,
    label: 'Clean Sheets',
    shortLabel: 'CS',
    category: 'defending' as const,
    higherIsBetter: true,
    maxRadarValue: 8,
  };

  getMatchValue(match: PlayerMatchStatistics): number {
    return match.cleanSheet ? 1 : 0;
  }
}

export const cleanSheetsMetric = new CleanSheetsMetric();

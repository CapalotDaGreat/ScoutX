import { BaseStatisticMetric } from '@/features/player-statistics/models/base/BaseStatisticMetric';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';

export class PassAccuracyMetric extends BaseStatisticMetric {
  readonly key = 'passAccuracy' as const;

  readonly definition = {
    key: this.key,
    label: 'Pass Accuracy',
    shortLabel: 'Pass',
    category: 'possession' as const,
    unit: '%',
    higherIsBetter: true,
    maxRadarValue: 100,
  };

  getMatchValue(match: PlayerMatchStatistics): number {
    return match.passAccuracy;
  }

  override getTotal(matches: PlayerMatchStatistics[]): number {
    const playedMatches = this.getPlayedMatches(matches);
    if (playedMatches.length === 0) {
      return 0;
    }

    const totalAccuracy = playedMatches.reduce(
      (sum, match) => sum + this.getMatchValue(match),
      0,
    );
    return totalAccuracy / playedMatches.length;
  }

  override getAverage(matches: PlayerMatchStatistics[]): number {
    return this.getTotal(matches);
  }

  override getAverageLabel(): string {
    return 'Season average';
  }
}

export const passAccuracyMetric = new PassAccuracyMetric();

import {
  type PlayerMatchStatistics,
  type StatisticMetricDefinition,
  type StatisticMetricKey,
} from '@/features/player-statistics/types';

export abstract class BaseStatisticMetric {
  abstract readonly key: StatisticMetricKey;
  abstract readonly definition: StatisticMetricDefinition;

  abstract getMatchValue(match: PlayerMatchStatistics): number;

  getPlayedMatches(matches: PlayerMatchStatistics[]): PlayerMatchStatistics[] {
    return matches.filter((match) => match.minutes > 0);
  }

  getTotal(matches: PlayerMatchStatistics[]): number {
    return matches.reduce((sum, match) => sum + this.getMatchValue(match), 0);
  }

  getAverage(matches: PlayerMatchStatistics[]): number {
    if (matches.length === 0) {
      return 0;
    }

    return this.getTotal(matches) / matches.length;
  }

  formatValue(value: number): string {
    if (this.key === 'passAccuracy') {
      return `${Math.round(value)}%`;
    }

    if (this.key === 'minutes') {
      return Math.round(value).toLocaleString();
    }

    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  normalizeForRadar(total: number): number {
    return Math.min(total / this.definition.maxRadarValue, 1);
  }

  getAverageLabel(): string {
    if (this.key === 'passAccuracy') {
      return 'Season average';
    }

    if (this.key === 'matches') {
      return 'Matches played';
    }

    return 'Avg per match';
  }

  getDisplaySubtitle(average: number): string {
    return `${this.getAverageLabel()} ${this.formatValue(average)}`;
  }
}

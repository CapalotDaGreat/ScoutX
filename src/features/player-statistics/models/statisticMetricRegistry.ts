import { assistsMetric } from '@/features/player-statistics/models/AssistsMetric';
import { BaseStatisticMetric } from '@/features/player-statistics/models/base/BaseStatisticMetric';
import { cleanSheetsMetric } from '@/features/player-statistics/models/CleanSheetsMetric';
import { goalsMetric } from '@/features/player-statistics/models/GoalsMetric';
import { matchesMetric } from '@/features/player-statistics/models/MatchesMetric';
import { minutesMetric } from '@/features/player-statistics/models/MinutesMetric';
import { passAccuracyMetric } from '@/features/player-statistics/models/PassAccuracyMetric';
import { shotsMetric } from '@/features/player-statistics/models/ShotsMetric';
import { tacklesMetric } from '@/features/player-statistics/models/TacklesMetric';
import {
  type StatisticMetricDefinition,
  type StatisticMetricKey,
  type PlayerMatchStatistics,
} from '@/features/player-statistics/types';

export const statisticMetrics: BaseStatisticMetric[] = [
  goalsMetric,
  assistsMetric,
  minutesMetric,
  matchesMetric,
  cleanSheetsMetric,
  passAccuracyMetric,
  shotsMetric,
  tacklesMetric,
];

export const statisticMetricRegistry: Record<StatisticMetricKey, BaseStatisticMetric> = {
  goals: goalsMetric,
  assists: assistsMetric,
  minutes: minutesMetric,
  matches: matchesMetric,
  cleanSheets: cleanSheetsMetric,
  passAccuracy: passAccuracyMetric,
  shots: shotsMetric,
  tackles: tacklesMetric,
};

export const statisticMetricKeys: StatisticMetricKey[] = statisticMetrics.map(
  (metric) => metric.key,
);

export const statisticMetricDefinitions: Record<StatisticMetricKey, StatisticMetricDefinition> =
  statisticMetricKeys.reduce(
    (definitions, key) => {
      definitions[key] = statisticMetricRegistry[key].definition;
      return definitions;
    },
    {} as Record<StatisticMetricKey, StatisticMetricDefinition>,
  );

export function getMetricModel(key: StatisticMetricKey): BaseStatisticMetric {
  return statisticMetricRegistry[key];
}

export function getMatchMetricValue(
  match: PlayerMatchStatistics,
  key: StatisticMetricKey,
): number {
  return getMetricModel(key).getMatchValue(match);
}

export function formatStatisticValue(key: StatisticMetricKey, value: number): string {
  return getMetricModel(key).formatValue(value);
}

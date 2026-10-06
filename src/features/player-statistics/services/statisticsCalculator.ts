import {
  formatStatisticValue,
  getMetricModel,
  statisticMetricKeys,
} from '@/features/player-statistics/models/statisticMetricRegistry';
import {
  type MatchHistoryItem,
  type PlayerMatchStatistics,
  type PlayerStatisticsOverview,
  type ProgressGraph,
  type RadarChartPoint,
  type StatisticMetricKey,
  type StatisticSummaryItem,
  type StatisticTrend,
  type StatisticTrendDirection,
} from '@/features/player-statistics/types';

const defaultProgressMetrics: StatisticMetricKey[] = [
  'goals',
  'assists',
  'passAccuracy',
  'tackles',
];

function sortMatchesByDate(matches: PlayerMatchStatistics[]): PlayerMatchStatistics[] {
  return [...matches].sort(
    (first, second) => new Date(first.date).getTime() - new Date(second.date).getTime(),
  );
}

function createTrendLabel(key: StatisticMetricKey, delta: number): string {
  if (delta === 0) {
    return 'No change';
  }

  const formattedDelta = formatStatisticValue(key, Math.abs(delta));
  return `${delta > 0 ? '+' : '-'}${formattedDelta} recent`;
}

function getTrendDirection(delta: number): StatisticTrendDirection {
  if (delta > 0) {
    return 'up';
  }

  if (delta < 0) {
    return 'down';
  }

  return 'neutral';
}

function calculateTrend(matches: PlayerMatchStatistics[], key: StatisticMetricKey): StatisticTrend {
  if (matches.length < 2) {
    return {
      value: 'New baseline',
      direction: 'neutral',
      delta: 0,
    };
  }

  const metric = getMetricModel(key);
  const midpoint = Math.ceil(matches.length / 2);
  const previousMatches = matches.slice(0, midpoint);
  const recentMatches = matches.slice(midpoint);
  const previousAverage = metric.getAverage(previousMatches);
  const recentAverage = metric.getAverage(recentMatches);
  const delta = recentAverage - previousAverage;

  return {
    value: createTrendLabel(key, delta),
    direction: getTrendDirection(delta),
    delta,
  };
}

function createSummaryItem(
  matches: PlayerMatchStatistics[],
  key: StatisticMetricKey,
): StatisticSummaryItem {
  const metric = getMetricModel(key);
  const total = metric.getTotal(matches);
  const average = metric.getAverage(matches);

  return {
    key,
    label: metric.definition.label,
    value: total,
    formattedValue: metric.formatValue(total),
    average,
    formattedAverage: metric.formatValue(average),
    trend: calculateTrend(matches, key),
    averageLabel: metric.getAverageLabel(),
    displaySubtitle: metric.getDisplaySubtitle(average),
  };
}

function createRadarPoint(
  matches: PlayerMatchStatistics[],
  key: StatisticMetricKey,
): RadarChartPoint {
  const metric = getMetricModel(key);
  const value = metric.getTotal(matches);

  return {
    key,
    label: metric.definition.shortLabel,
    value,
    normalizedValue: metric.normalizeForRadar(value),
  };
}

function createProgressGraph(
  matches: PlayerMatchStatistics[],
  key: StatisticMetricKey,
): ProgressGraph {
  const metric = getMetricModel(key);

  return {
    key,
    label: metric.definition.label,
    trend: calculateTrend(matches, key),
    points: matches.filter((match) => metric.hasMatchValue(match)).map((match, index) => {
      const value = metric.getMatchValue(match);
      return {
        matchId: match.id,
        label: `M${index + 1}`,
        value,
        formattedValue: metric.formatValue(value),
      };
    }),
  };
}

function createMatchHistoryItem(match: PlayerMatchStatistics): MatchHistoryItem {
  const contributions = match.goals + match.assists;
  const cleanSheetLabel = match.cleanSheet ? 'clean sheet' : 'conceded';

  return {
    id: match.id,
    date: match.date,
    opponent: match.opponent,
    competition: match.competition,
    result: match.result,
    summary:
      match.passAccuracy !== null
        ? `${contributions} G/A, ${match.passAccuracy}% passing, ${cleanSheetLabel}`
        : `${contributions} G/A, ${cleanSheetLabel}`,
    stats: {
      minutes: match.minutes,
      goals: match.goals,
      assists: match.assists,
      cleanSheet: match.cleanSheet,
      passAccuracy: match.passAccuracy,
      shots: match.shots,
      tackles: match.tackles,
      yellowCards: match.yellowCards,
      redCards: match.redCards,
      matchRating: match.matchRating,
    },
    notes: match.notes,
  };
}

export function calculatePlayerStatistics(
  matches: PlayerMatchStatistics[],
): PlayerStatisticsOverview {
  const sortedMatches = sortMatchesByDate(matches);
  const recentMatches = sortedMatches.slice(-8);

  return {
    totals: statisticMetricKeys.map((key) => createSummaryItem(sortedMatches, key)),
    radar: statisticMetricKeys.map((key) => createRadarPoint(sortedMatches, key)),
    progressGraphs: defaultProgressMetrics.map((key) => createProgressGraph(recentMatches, key)),
    matchHistory: [...sortedMatches].reverse().map(createMatchHistoryItem),
    matchCount: sortedMatches.length,
  };
}

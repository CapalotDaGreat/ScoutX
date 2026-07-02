import {
  formatStatisticValue,
  getMatchMetricValue,
  statisticMetricDefinitions,
  statisticMetricKeys,
} from '@/features/player-statistics/models/StatisticMetricModel';
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

const defaultProgressMetrics: StatisticMetricKey[] = ['goals', 'assists', 'passAccuracy', 'tackles'];

function sortMatchesByDate(matches: PlayerMatchStatistics[]): PlayerMatchStatistics[] {
  return [...matches].sort(
    (first, second) => new Date(first.date).getTime() - new Date(second.date).getTime(),
  );
}

function getTotal(matches: PlayerMatchStatistics[], key: StatisticMetricKey): number {
  if (key === 'passAccuracy') {
    const playedMatches = matches.filter((match) => match.minutes > 0);
    if (playedMatches.length === 0) {
      return 0;
    }

    const totalAccuracy = playedMatches.reduce(
      (sum, match) => sum + getMatchMetricValue(match, key),
      0,
    );
    return totalAccuracy / playedMatches.length;
  }

  return matches.reduce((sum, match) => sum + getMatchMetricValue(match, key), 0);
}

function getAverage(matches: PlayerMatchStatistics[], key: StatisticMetricKey): number {
  if (matches.length === 0) {
    return 0;
  }

  if (key === 'passAccuracy') {
    return getTotal(matches, key);
  }

  return getTotal(matches, key) / matches.length;
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

  const midpoint = Math.ceil(matches.length / 2);
  const previousMatches = matches.slice(0, midpoint);
  const recentMatches = matches.slice(midpoint);
  const previousAverage = getAverage(previousMatches, key);
  const recentAverage = getAverage(recentMatches, key);
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
  const definition = statisticMetricDefinitions[key];
  const total = getTotal(matches, key);
  const average = getAverage(matches, key);

  return {
    key,
    label: definition.label,
    value: total,
    formattedValue: formatStatisticValue(key, total),
    average,
    formattedAverage: formatStatisticValue(key, average),
    trend: calculateTrend(matches, key),
  };
}

function createRadarPoint(
  matches: PlayerMatchStatistics[],
  key: StatisticMetricKey,
): RadarChartPoint {
  const definition = statisticMetricDefinitions[key];
  const value = getTotal(matches, key);

  return {
    key,
    label: definition.shortLabel,
    value,
    normalizedValue: Math.min(value / definition.maxRadarValue, 1),
  };
}

function createProgressGraph(
  matches: PlayerMatchStatistics[],
  key: StatisticMetricKey,
): ProgressGraph {
  const definition = statisticMetricDefinitions[key];

  return {
    key,
    label: definition.label,
    trend: calculateTrend(matches, key),
    points: matches.map((match, index) => {
      const value = getMatchMetricValue(match, key);
      return {
        matchId: match.id,
        label: `M${index + 1}`,
        value,
        formattedValue: formatStatisticValue(key, value),
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
    summary: `${contributions} G/A, ${match.passAccuracy}% passing, ${cleanSheetLabel}`,
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

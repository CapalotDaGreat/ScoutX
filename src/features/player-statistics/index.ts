export {
  PlayerStatisticsSection,
  type PlayerStatisticsSectionProps,
} from './components/PlayerStatisticsSection';
export { StatisticsScreen, type StatisticsScreenProps } from './components/StatisticsScreen';
export { StatisticsCards, type StatisticsCardsProps } from './components/StatisticsCards';
export { RadarChart, type RadarChartProps } from './components/RadarChart';
export { ProgressGraphs, type ProgressGraphsProps } from './components/ProgressGraphs';
export { MatchHistory, type MatchHistoryProps } from './components/MatchHistory';
export { LogMatchModal, type LogMatchModalProps } from './components/LogMatchModal';
export { usePlayerStatistics, type UsePlayerStatisticsOptions } from './hooks/usePlayerStatistics';
export { calculatePlayerStatistics } from './services/statisticsCalculator';
export {
  mockPlayerStatisticsMatches,
  getMockPlayerStatistics,
} from './services/mockPlayerStatisticsService';
export { mapMatchesToProfileStats } from './utils/profileStatsMapper';
export {
  statisticMetricDefinitions,
  statisticMetricKeys,
  statisticMetricRegistry,
  statisticMetrics,
  getMetricModel,
  getMatchMetricValue,
  formatStatisticValue,
  goalsMetric,
  assistsMetric,
  minutesMetric,
  matchesMetric,
  cleanSheetsMetric,
  passAccuracyMetric,
  shotsMetric,
  tacklesMetric,
} from './models/StatisticMetricModel';
export type {
  MatchHistoryItem,
  PlayerMatchStatistics,
  PlayerStatisticsOverview,
  ProgressGraph,
  ProgressGraphPoint,
  RadarChartPoint,
  StatisticMetricDefinition,
  StatisticMetricKey,
  StatisticSummaryItem,
  StatisticTrend,
  StatisticTrendDirection,
  MatchLogPayload,
} from './types';

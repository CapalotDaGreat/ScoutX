export { PlayerComparisonScreen } from './components/PlayerComparisonScreen';
export { ComparisonMetricTable } from './components/ComparisonMetricTable';
export { ComparisonRadarChart } from './components/ComparisonRadarChart';
export { ComparisonTrendChart } from './components/ComparisonTrendChart';
export { ComparisonPlayerStrip } from './components/ComparisonPlayerStrip';
export { ComparisonPlayerPickerModal } from './components/ComparisonPlayerPickerModal';

export { usePlayerComparison } from './hooks/usePlayerComparison';

export {
  buildComparisonProfile,
  buildComparisonProfiles,
  mergeTrendPoints,
} from './services/comparisonProfileService';

export {
  buildStatisticsRows,
  buildPhysicalRows,
  buildTechnicalRows,
  buildGpsRows,
  getBestPlayerIdForRow,
  getMetricDelta,
} from './services/comparisonMetricsService';

export {
  MAX_COMPARISON_PLAYERS,
  COMPARISON_PLAYER_COLORS,
  COMPARISON_SECTION_LABELS,
} from './constants';

export type {
  ComparisonPlayerProfile,
  ComparisonMetricRow,
  ComparisonMetricValue,
  ComparisonSectionKey,
  ComparisonTrendPoint,
  ComparisonVideoSummary,
  ComparisonGpsSummary,
  ComparisonCareerSummary,
} from './types';

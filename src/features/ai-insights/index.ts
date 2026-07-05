export { AiInsightPanel } from './components/AiInsightPanel';
export { AiInsightCard } from './components/AiInsightCard';
export { AiRecommendationList } from './components/AiRecommendationList';

export { AiInsightsProvider, useAiInsights } from './context/AiInsightsProvider';
export { useAiInsight } from './hooks/useAiInsight';

export { AiInsightsService } from './services/aiInsightsService';
export { buildCompletionPrompts, buildSystemPrompt, buildUserPrompt } from './services/aiPromptService';
export {
  buildCareerInsightContext,
  buildGpsInsightContext,
  buildPerformanceContext,
  buildPotentialContext,
  buildVideoInsightContext,
  playerContextFromDiscoverable,
  serializeInsightContext,
  statisticsContextFromMatches,
} from './services/aiContextService';
export { parseAiInsightResponse } from './services/aiResponseParser';

export { AiCareerCoachCard } from './components/AiCareerCoachCard';
export { createAiProvider } from './providers/createAiProvider';
export { CloudFunctionAiProvider } from './providers/cloudFunctionAiProvider';
export { MockAiProvider } from './providers/mockAiProvider';
export { OpenRouterAiProvider } from './providers/openRouterProvider';
export type { AiProvider } from './providers/types';

export { AI_INSIGHT_LABELS, AI_INSIGHT_DESCRIPTIONS } from './constants';

export type {
  AiInsight,
  AiInsightType,
  AiInsightContext,
  AiInsightMap,
  AiRecommendation,
  AiHighlight,
  PerformanceSummaryInsight,
  ImprovementSuggestionsInsight,
  TrainingRecommendationsInsight,
  PotentialAnalysisInsight,
  CareerProgressionSummaryInsight,
  VideoSummaryInsight,
  GpsSummaryInsight,
} from './types';

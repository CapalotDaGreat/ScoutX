export type AiInsightType =
  | 'performance_summary'
  | 'improvement_suggestions'
  | 'training_recommendations'
  | 'potential_analysis'
  | 'career_progression_summary'
  | 'video_summary'
  | 'gps_summary';

export type AiConfidence = 'low' | 'medium' | 'high';

export type AiTrend = 'up' | 'down' | 'neutral';

export type AiPriority = 'low' | 'medium' | 'high';

export type AiTrajectory = 'rising' | 'stable' | 'plateauing';

export type AiInsightBase = {
  type: AiInsightType;
  generatedAt: string;
  /** Null when the model did not report a confidence; never defaulted. */
  confidence: AiConfidence | null;
  title: string;
  summary: string;
};

export type AiHighlight = {
  label: string;
  value: string;
  trend?: AiTrend;
};

export type AiRecommendation = {
  id: string;
  title: string;
  description: string;
  /** Null when the model omitted priority; never defaulted to medium. */
  priority: AiPriority | null;
  category?: string;
};

export type PerformanceSummaryInsight = AiInsightBase & {
  type: 'performance_summary';
  highlights: AiHighlight[];
  narrative: string;
};

export type ImprovementSuggestionsInsight = AiInsightBase & {
  type: 'improvement_suggestions';
  suggestions: AiRecommendation[];
  focusAreas: string[];
};

export type TrainingRecommendationsInsight = AiInsightBase & {
  type: 'training_recommendations';
  drills: AiRecommendation[];
  weeklyFocus: string;
};

export type PotentialAnalysisInsight = AiInsightBase & {
  type: 'potential_analysis';
  /** Ratings are null unless the model returned a number; the UI must not invent one. */
  currentRating: number | null;
  potentialRating: number | null;
  growthAreas: string[];
  trajectory: AiTrajectory | null;
  scoutNotes: string;
};

export type CareerMilestone = {
  title: string;
  period: string;
  significance: string;
};

export type CareerProgressionSummaryInsight = AiInsightBase & {
  type: 'career_progression_summary';
  milestones: CareerMilestone[];
  nextSteps: string[];
};

export type VideoMoment = {
  /** Null when the model described a moment without a verifiable timestamp. */
  timestamp: string | null;
  description: string;
};

export type VideoSummaryInsight = AiInsightBase & {
  type: 'video_summary';
  keyMoments: VideoMoment[];
  strengthsShown: string[];
  areasToImprove: string[];
};

export type GpsSummaryInsight = AiInsightBase & {
  type: 'gps_summary';
  movementProfile: string;
  metrics: AiHighlight[];
  tacticalInsights: string[];
};

export type AiInsight =
  | PerformanceSummaryInsight
  | ImprovementSuggestionsInsight
  | TrainingRecommendationsInsight
  | PotentialAnalysisInsight
  | CareerProgressionSummaryInsight
  | VideoSummaryInsight
  | GpsSummaryInsight;

export type AiInsightMap = {
  performance_summary: PerformanceSummaryInsight;
  improvement_suggestions: ImprovementSuggestionsInsight;
  training_recommendations: TrainingRecommendationsInsight;
  potential_analysis: PotentialAnalysisInsight;
  career_progression_summary: CareerProgressionSummaryInsight;
  video_summary: VideoSummaryInsight;
  gps_summary: GpsSummaryInsight;
};

export type AiPlayerContext = {
  playerId: string;
  playerName: string;
  position?: string[];
  age?: number;
  club?: string;
  nationality?: string;
};

export type AiStatisticsContext = {
  matchCount: number;
  totals: Record<string, number>;
  averages?: Record<string, number>;
  recentResults?: string[];
};

export type AiGpsSessionContext = {
  matchLabel: string;
  distanceKm: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  sprintCount: number;
  durationMin: number;
};

export type AiVideoContext = {
  title: string;
  category: string;
  durationSec: number;
  description?: string;
};

export type AiJourneyContext = {
  title: string;
  type: string;
  date: string;
  organization?: string;
};

export type AiRatingsContext = {
  overallRating?: number;
  potentialRating?: number;
};

export type AiInsightContext = {
  player: AiPlayerContext;
  statistics?: AiStatisticsContext;
  gpsSessions?: AiGpsSessionContext[];
  videos?: AiVideoContext[];
  journey?: AiJourneyContext[];
  ratings?: AiRatingsContext;
};

export type AiCompletionRequest = {
  insightType: AiInsightType;
  systemPrompt: string;
  userPrompt: string;
  contextJson: string;
};

export type AiProviderMetadata = {
  id: string;
  label: string;
  isLive: boolean;
};

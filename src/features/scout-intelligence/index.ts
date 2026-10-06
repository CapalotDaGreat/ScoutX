export type {
  DiscoveryCoverageMap,
  EvidenceRequest,
  EvidenceRequestKind,
  PipelineStage,
  PositionGroup,
  ProvenanceMetric,
  ScoutBrief,
  ScoutRecommendation,
  SimilarPlayerScore,
  StageHistoryEntry,
  TrialEvaluation,
  TrialPrep,
  TrialReflection,
  WatchlistEvent,
  WhyThisPlayerReason,
} from '@/features/scout-intelligence/types';

export {
  PIPELINE_STAGES,
  appendStageHistory,
  migratePipelineStage,
} from '@/features/scout-intelligence/services/pipelineStageMigration';
export { explainWhyThisPlayer } from '@/features/scout-intelligence/services/whyThisPlayer';
export { rankSimilarPlayers, scoreSimilarPlayer } from '@/features/scout-intelligence/services/similarPlayers';
export {
  comparisonSectionsForGroup,
  positionGroupFor,
  sharedPositionGroup,
  statisticKeysForGroup,
} from '@/features/scout-intelligence/services/positionComparison';
export { buildScoutBrief } from '@/features/scout-intelligence/services/scoutBrief';

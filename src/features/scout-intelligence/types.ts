import type { CoverageState } from '@/features/development/types';
import type { PlayerPosition } from '@/features/scout-discovery/types';

export type PipelineStage =
  | 'discovered'
  | 'shortlisted'
  | 'contacted'
  | 'invited'
  | 'trial'
  | 'evaluated'
  | 'follow_up';

export type StageHistoryEntry = {
  stage: PipelineStage;
  at: string;
};

export type WhyThisPlayerCode =
  | 'position'
  | 'recent_evidence'
  | 'sample_size'
  | 'video'
  | 'verified'
  | 'coverage'
  | 'style';

export type WhyThisPlayerReason = {
  id: string;
  code: WhyThisPlayerCode;
  /** Cited evidence item ids when they exist; never invented. */
  evidenceIds: string[];
  sampleSize: number;
  freshnessAt: string | null;
};

export type SimilarPlayerScore = {
  playerId: string;
  overlap: number;
  sharedPositions: PlayerPosition[];
  sharedStyleTags: string[];
  sameClub: boolean;
  sameLeague: boolean;
};

export type PositionGroup = 'goalkeeper' | 'defender' | 'midfielder' | 'forward';

export type ScoutRecommendation =
  | 'monitor'
  | 'invite'
  | 'trial'
  | 'pass'
  | 'insufficient_evidence';

export type ScoutBrief = {
  id: string;
  scoutId: string;
  playerId: string;
  headline: string;
  evidencePoints: string[];
  gaps: string[];
  recommendation: ScoutRecommendation;
  evidenceIds: string[];
  createdAt: string;
};

export type EvidenceRequestKind =
  | 'match_footage'
  | 'highlight'
  | 'gps'
  | 'statistics'
  | 'coach_note';

export type EvidenceRequestStatus = 'pending' | 'fulfilled' | 'declined';

export type EvidenceRequest = {
  id: string;
  scoutId: string;
  playerId: string;
  kinds: EvidenceRequestKind[];
  message: string;
  status: EvidenceRequestStatus;
  createdAt: string;
  updatedAt: string;
};

export type WatchlistEventType =
  | 'added'
  | 'stage_changed'
  | 'new_evidence'
  | 'removed';

export type WatchlistEvent = {
  id: string;
  scoutId: string;
  playerId: string;
  type: WatchlistEventType;
  /** For new_evidence: what the player added, from public summary counts. */
  changes: Array<'match' | 'video'>;
  fromStage: PipelineStage | null;
  toStage: PipelineStage | null;
  lastEvidenceAt: string | null;
  createdAt: string;
};

export type TrialPrep = {
  notes: string;
  updatedAt: string;
};

export type TrialEvaluation = {
  roleFit: string;
  notes: string;
  recommendation: ScoutRecommendation;
  confidenceLabel: CoverageState;
  evidenceIds: string[];
  createdAt: string;
};

export type TrialReflection = {
  trialId: string;
  ownerId: string;
  wentWell: string;
  improve: string;
  createdAt: string;
  updatedAt: string;
};

export type DiscoveryCoverageMap = {
  technical: CoverageState;
  tactical: CoverageState;
  physical: CoverageState;
  consistency: CoverageState;
  video: CoverageState;
};

export type ProvenanceMetric = {
  value: number | null;
  sampleSize: number;
  provenance: 'match_derived' | 'self_reported' | 'coach_provided' | 'club_provided' | 'gps_derived' | null;
};

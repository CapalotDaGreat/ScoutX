import type { CoverageState, GoalStatus } from '@/features/development/types';

/**
 * Shared intelligence primitives. Everything in this feature is derived deterministically
 * from stored records; nothing is estimated or generated. When the record is too thin to
 * support a statement, the statement is not made.
 */

export type CoverageDimension = 'technical' | 'tactical' | 'physical' | 'consistency' | 'video';

/** Compact, comparable picture of a player's football record at one moment. */
export type FootballStateSnapshot = {
  takenAt: string;
  matchIds: string[];
  completedAnalysisIds: string[];
  goalStatus: Record<string, GoalStatus>;
  videoIds: string[];
  trialStatus: Record<string, string>;
  primaryPosition: string | null;
  verificationLevel: string | null;
  coverage: Partial<Record<CoverageDimension, CoverageState>>;
  endorsementIds: string[];
};

export type ChangeKind =
  | 'new_matches'
  | 'new_analysis'
  | 'goal_achieved'
  | 'goal_improving'
  | 'new_video'
  | 'new_trial'
  | 'trial_status'
  | 'role_change'
  | 'verification_change'
  | 'coverage_up'
  | 'coverage_down'
  | 'new_endorsement';

export type ChangeItem = {
  id: string;
  kind: ChangeKind;
  /** Higher = more meaningful. Items below the display threshold are dropped. */
  significance: number;
  entityId?: string;
  params: Record<string, string | number>;
};

export type GoalNextStepKind =
  | 'prove_achievement'
  | 'revisit_goal'
  | 'baseline_missing'
  | 'record_metric'
  | 'log_match_to_measure'
  | 'play_more_matches'
  | 'log_training'
  | 'shift_focus'
  | 'ask_coach'
  | 'keep_going'
  | 'reflect';

export type GoalNextStep = {
  kind: GoalNextStepKind;
  /** Why this step was chosen; interpolated into translated copy. */
  params: Record<string, string | number>;
};

export type NextBestEvidenceKind =
  | 'first_match'
  | 'recent_match'
  | 'match_video'
  | 'match_analysis'
  | 'record_passing'
  | 'record_defending'
  | 'coach_reference'
  | 'gps_session';

export type NextBestEvidence = {
  kind: NextBestEvidenceKind;
  /** The dimension this evidence would strengthen. */
  dimension: CoverageDimension | 'recency' | 'verification';
  /** Strongest existing dimension, when one is at least moderate (used for contrast copy). */
  strongestDimension: CoverageDimension | null;
  params: Record<string, string | number>;
};

export type ClaimKind = 'position' | 'playing_style' | 'weak_foot' | 'skill_moves';

export type EvidenceGapAction = 'add_match' | 'add_clip' | 'ask_coach' | 'edit_claim' | 'record_metric';

export type EvidenceGap = {
  id: string;
  claimKind: ClaimKind;
  claimValue: string;
  support: 'none' | 'limited' | 'self_reported_only';
  sampleSize: number;
  required: number;
  actions: EvidenceGapAction[];
};

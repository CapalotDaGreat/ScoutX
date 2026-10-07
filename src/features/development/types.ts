import { type EvidenceConfidence, type EvidenceRef } from '@/features/evidence/types';

/**
 * Development Engine types.
 *
 * Everything here is either entered by the player (self-reported) or derived
 * deterministically from their logged matches (match-derived). Nothing is estimated:
 * when a metric was not recorded, the value is `null` and the state is `insufficient`.
 */

export type GoalCategory = 'technical' | 'tactical' | 'physical' | 'mental' | 'consistency';
export const GOAL_CATEGORIES: readonly GoalCategory[] = [
  'technical',
  'tactical',
  'physical',
  'mental',
  'consistency',
];

export type GoalStatus = 'not_started' | 'active' | 'improving' | 'achieved' | 'revisit';

export type GoalOrigin = 'manual' | 'coaching_moment' | 'passport_coach';

/**
 * Metrics a goal can be measured against using logged match data. `none` means the goal is
 * tracked by the player's own progress notes only and never gets a computed percentage.
 */
export type GoalMetricKey =
  | 'goals'
  | 'assists'
  | 'shots'
  | 'tackles'
  | 'passAccuracy'
  | 'matchRating'
  | 'minutes'
  | 'none';

export const GOAL_METRIC_KEYS: readonly GoalMetricKey[] = [
  'none',
  'goals',
  'assists',
  'shots',
  'tackles',
  'passAccuracy',
  'matchRating',
  'minutes',
];

export type GoalMeasurement = {
  value: number;
  /** Number of matches the value was derived from. */
  sampleSize: number;
  evidenceIds: string[];
  measuredAt: string;
};

export type GoalProgressSource = 'manual' | 'match' | 'training';

export type GoalProgressEntry = {
  id: string;
  date: string;
  note: string;
  value: number | null;
  evidenceIds: string[];
  source: GoalProgressSource;
};

export type DevelopmentGoal = {
  id: string;
  ownerId: string;
  title: string;
  category: GoalCategory;
  metricKey: GoalMetricKey;
  positionRelevance: string[];
  baseline: GoalMeasurement | null;
  targetValue: number | null;
  targetLabel: string;
  timeframeEnd: string | null;
  status: GoalStatus;
  progress: GoalProgressEntry[];
  linkedMatchIds: string[];
  linkedTrainingIds: string[];
  evidenceIds: string[];
  practiceSuggestions: string[];
  reflection: string;
  origin: GoalOrigin;
  createdAt: string;
  updatedAt: string;
  achievedAt: string | null;
};

export type DevelopmentGoalDraft = Pick<
  DevelopmentGoal,
  'title' | 'category' | 'metricKey' | 'targetValue' | 'targetLabel' | 'timeframeEnd'
> &
  Partial<Pick<DevelopmentGoal, 'positionRelevance' | 'practiceSuggestions' | 'origin' | 'evidenceIds'>>;

export type TrainingSessionType = 'team' | 'individual' | 'gym' | 'recovery' | 'match_prep' | 'other';
export const TRAINING_SESSION_TYPES: readonly TrainingSessionType[] = [
  'team',
  'individual',
  'gym',
  'recovery',
  'match_prep',
  'other',
];

export type TrainingReflection = {
  wentWell: string;
  improve: string;
};

export type TrainingSession = {
  id: string;
  ownerId: string;
  type: TrainingSessionType;
  date: string;
  durationMin: number | null;
  focus: string;
  goalIds: string[];
  notes: string;
  evidenceIds: string[];
  reflection: TrainingReflection | null;
  createdAt: string;
  updatedAt: string;
};

export type TrainingSessionDraft = Pick<TrainingSession, 'type' | 'date' | 'durationMin' | 'focus' | 'goalIds' | 'notes'> & {
  reflection?: TrainingReflection | null;
};

export type IdentitySource = 'self_reported' | 'club_provided' | 'coach_provided';

/** A date-effective statement of who the player is on the pitch. */
export type IdentitySnapshot = {
  id: string;
  ownerId: string;
  effectiveFrom: string;
  position: string | null;
  secondaryPositions: string[];
  club: string | null;
  style: string | null;
  strongFoot: string | null;
  source: IdentitySource;
  createdAt: string;
};

export type ObservationKind = 'observation' | 'inference' | 'unknown';

/** Coaching moment produced by the match analysis pipeline; references evidence, never copies it. */
export type CoachingMoment = {
  id: string;
  timestampSec: number | null;
  eventIds: string[];
  context: string;
  observation: string;
  kind: ObservationKind;
  coachingPoint: string;
  practiceIdea: string | null;
  measurement: string | null;
  confidenceLabel: EvidenceConfidence | null;
  evidenceRefs: EvidenceRef[];
};

export type CoverageState = 'strong' | 'moderate' | 'limited' | 'insufficient';

export type MatchDerivedMetricKey = Exclude<GoalMetricKey, 'none'>;

export type MetricDirection = 'higher_is_better' | 'lower_is_better';

export type MetricWindow = {
  value: number;
  sampleSize: number;
  from: string;
  to: string;
};

export type BeforeVsNowComparison =
  | {
      metricKey: MatchDerivedMetricKey;
      state: 'available';
      before: MetricWindow;
      now: MetricWindow;
      delta: number;
      direction: 'up' | 'down' | 'flat';
      /** Whether the delta is good news for the player. */
      improved: boolean | null;
      provenance: 'match_derived';
    }
  | {
      metricKey: MatchDerivedMetricKey;
      state: 'insufficient';
      reason: 'not_enough_matches' | 'metric_not_recorded';
      sampleSize: number;
      required: number;
    };

export type PlayerDnaTraitId =
  | 'goal_threat'
  | 'creator'
  | 'ball_retention'
  | 'defensive_presence'
  | 'discipline'
  | 'availability';

export type PlayerDnaTrait = {
  id: PlayerDnaTraitId;
  state: CoverageState;
  /** Matches that contributed to this trait. */
  sampleSize: number;
  value: number | null;
  unit: 'per_match' | 'percent' | 'minutes';
  provenance: 'match_derived';
};

export type HowIPlay = {
  selfReported: {
    style: string | null;
    positions: string[];
    strongFoot: string | null;
    captainExperience: boolean;
  };
  matchDerived: PlayerDnaTrait[];
  sampleSize: number;
  /** Date of the newest recorded match behind the DNA; null when none has a valid date. */
  latestMatchAt: string | null;
};

export type GoalProgressSummary = {
  goal: DevelopmentGoal;
  status: GoalStatus;
  current: GoalMeasurement | null;
  /** 0–100 only when baseline, current and target all exist and target differs from baseline. */
  percent: number | null;
  daysLeft: number | null;
  lastProgressAt: string | null;
};

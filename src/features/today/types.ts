/** Where an action leads. Resolved to concrete navigation by the player shell. */
export type TodayRoute =
  | 'logMatch'
  | 'matchAnalysis'
  | 'highlightStudio'
  | 'manageVideos'
  | 'trials'
  | 'passportSetup'
  | 'development'
  | 'matchReflection';

export type NextBestActionType =
  | 'log_first_match'
  | 'log_match'
  | 'retry_analysis'
  | 'review_coaching'
  | 'analyze_match'
  | 'respond_trial'
  | 'prepare_trial'
  | 'improve_passport'
  | 'build_reel'
  | 'set_goal'
  | 'log_training'
  | 'review_goal'
  | 'log_post_match'
  | 'reflect_match';

export type ActionParams = Record<string, string | number>;

export type NextBestAction = {
  id: string;
  type: NextBestActionType;
  /** Higher wins. Ties keep the order the rules produced them in. */
  priority: number;
  route: TodayRoute;
  entityId?: string;
  /** Values interpolated into the translated title, description and reason. */
  params: ActionParams;
};

export type ContinueItemKind =
  | 'match_draft'
  | 'failed_analysis'
  | 'analysis_in_progress'
  | 'failed_upload'
  | 'incomplete_passport'
  | 'goal_in_progress';

export type ContinueItem = {
  id: string;
  kind: ContinueItemKind;
  route: TodayRoute;
  entityId?: string;
  params: ActionParams;
};

/** Minimal shapes so the engine stays pure and independent of feature modules. */
export type TodayMatch = {
  id: string;
  date: string;
  opponent: string;
  /** Undefined when reflection state is unknown — the engine must not guess. */
  hasReflection?: boolean;
  /** Next-training priority the player set in an earlier reflection, if any. */
  reflectionPriority?: string | null;
};

export type TodayAnalysisJob = {
  id: string;
  status: 'draft' | 'uploading' | 'queued' | 'processing' | 'complete' | 'failed' | 'cancelled' | 'expired';
  createdAt: string;
  completedAt?: string;
  opponent: string;
  matchDate: string;
  hasReport: boolean;
  retryable: boolean;
};

export type TodayTrial = {
  id: string;
  club: string;
  status: 'pending' | 'accepted' | 'declined' | 'rescheduled' | 'cancelled' | 'completed';
  scheduledDate: string;
};

export type TodayVideo = {
  id: string;
  title: string;
  uploadStatus: 'pending' | 'uploading' | 'processing' | 'ready' | 'failed';
};

export type TodayPassportStep = {
  id: string;
  title: string;
  complete: boolean;
};

export type TodayGoal = {
  id: string;
  title: string;
  status: 'not_started' | 'active' | 'improving' | 'achieved' | 'revisit';
  updatedAt: string;
  createdAt: string;
};

export type TodayTraining = {
  id: string;
  date: string;
  type: string;
};

export type TodayInput = {
  now: Date;
  matches: TodayMatch[];
  analyses: TodayAnalysisJob[];
  /** False when analyses could not be loaded — the engine must not guess about them. */
  analysesLoaded: boolean;
  trials: TodayTrial[];
  videos: TodayVideo[];
  passportSteps: TodayPassportStep[];
  reviewedAnalysisIds: string[];
  matchDraft: { savedAt: string; opponent: string } | null;
  goals: TodayGoal[];
  trainingSessions: TodayTraining[];
  /**
   * Action types completed in the last day. Prevents the same suggestion looping
   * immediately after the player already did it.
   */
  recentlyCompletedTypes: NextBestActionType[];
};

export type TodayPlan = {
  primary: NextBestAction | null;
  secondary: NextBestAction[];
  continueItems: ContinueItem[];
};

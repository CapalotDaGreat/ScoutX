/** Where an action leads. Resolved to concrete navigation by the player shell. */
export type TodayRoute =
  | 'logMatch'
  | 'matchAnalysis'
  | 'highlightStudio'
  | 'manageVideos'
  | 'trials'
  | 'passportSetup';

export type NextBestActionType =
  | 'log_first_match'
  | 'log_match'
  | 'retry_analysis'
  | 'review_coaching'
  | 'analyze_match'
  | 'respond_trial'
  | 'prepare_trial'
  | 'improve_passport'
  | 'build_reel';

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
  | 'incomplete_passport';

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
};

export type TodayAnalysisJob = {
  id: string;
  status: 'draft' | 'uploading' | 'queued' | 'processing' | 'complete' | 'failed';
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
};

export type TodayPlan = {
  primary: NextBestAction | null;
  secondary: NextBestAction[];
  continueItems: ContinueItem[];
};

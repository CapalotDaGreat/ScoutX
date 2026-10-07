import type { MatchLogPayload } from '@/features/player-statistics/types';

export type MatchAnalysisJobStatus =
  | 'draft'
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'complete'
  | 'failed';

export type MatchAnalysisPipelineStageId =
  | 'video-ingestion'
  | 'match-segmentation'
  | 'player-identification'
  | 'identity-confirmation'
  | 'player-tracking'
  | 'event-detection'
  | 'tactical-context'
  | 'role-analysis'
  | 'cross-event-reasoning'
  | 'coaching-synthesis'
  | 'validation'
  | 'final-report';

export type MatchAnalysisPipelineStageStatus = 'pending' | 'active' | 'complete' | 'failed' | 'unavailable';

export type MatchAnalysisPipelineStage = {
  id: MatchAnalysisPipelineStageId;
  label: string;
  status: MatchAnalysisPipelineStageStatus;
  note?: string;
  startedAt?: string;
  completedAt?: string;
  attempts?: number;
  retryable?: boolean;
  progress?: number | null;
};

export type MatchSegmentType =
  | 'warmup'
  | 'first-half'
  | 'halftime'
  | 'second-half'
  | 'full-time'
  | 'stoppage'
  | 'substitution'
  | 'unknown';

export type MatchSegment = {
  id: string;
  type: MatchSegmentType;
  label: string;
  startSec: number;
  endSec: number;
  confidence: number;
  excludedFromPerformance: boolean;
  note: string;
};

export type PlayerAvailabilityState =
  | 'confirmed_visible'
  | 'likely_active_off_camera'
  | 'confirmed_off_pitch'
  | 'unknown';

export type PlayerAvailabilityWindow = {
  id: string;
  startSec: number;
  endSec: number;
  state: PlayerAvailabilityState;
  confidence: number;
  label: string;
  note: string;
};

export type PlayerTargeting = {
  jerseyNumber: string;
  kitPrimaryColor: string;
  kitSecondaryColor: string;
  teamSide?: 'home' | 'away' | 'unknown';
  notes?: string;
};

export type MatchContextInput = {
  opponent: string;
  competition: string;
  date: string;
  result?: string;
};

/** Countable stats for the nominated player. Null means the model did not have enough evidence to count it. */
export type MatchEstimatedStats = {
  minutesPlayed: number | null;
  goals: number | null;
  assists: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  passesAttempted: number | null;
  passesCompleted: number | null;
  passCompletionPct: number | null;
  keyPasses: number | null;
  tackles: number | null;
  duelsWon: number | null;
  duelsLost: number | null;
  foulsCommitted: number | null;
  yellowCards: number | null;
  redCards: number | null;
  matchRating: number | null;
  cleanSheet: boolean | null;
};

export type MatchMomentsInsight = {
  timestampSec: number;
  label: string;
  detail: string;
};

export type AnalysisConfidenceBand = 'Excellent' | 'Good' | 'Limited' | 'Insufficient';

export type EvidenceKind = 'observation' | 'inference' | 'unknown';

export type MatchAnalysisCoverage = {
  visiblePct: number;
  likelyOffCameraPct: number;
  unknownPct: number;
  confidenceLabel: AnalysisConfidenceBand;
  note: string;
};

export type MatchAnalysisEvidencePoint = {
  id?: string;
  kind: EvidenceKind;
  label: string;
  detail: string;
  confidence: number;
  timestampSec?: number;
  source?: string;
  frameIds?: string[];
};

export type MatchEventType =
  | 'shot'
  | 'goal'
  | 'assist'
  | 'pass'
  | 'key_pass'
  | 'tackle'
  | 'duel'
  | 'foul'
  | 'card'
  | 'save'
  | 'other';

export type MatchEventValidationStatus = 'accepted' | 'rejected' | 'needs_identity';

export type MatchEventVisibility = 'confirmed_visible' | 'off_camera' | 'unknown';

/** A single football action bound to sampled frames. Rejected events never become metrics. */
export type MatchAnalysisEvent = {
  eventId: string;
  videoTimestampSec: number;
  matchTimestamp?: number | null;
  type: MatchEventType;
  playerIdentityConfidence: AnalysisConfidenceBand;
  eventConfidence: AnalysisConfidenceBand;
  visibilityState: MatchEventVisibility;
  tacticalPhase?: string | null;
  fieldZone?: string | null;
  evidenceRefs: string[];
  validationStatus: MatchEventValidationStatus;
  rejectionReason?: string;
};

export type IdentityCandidate = {
  frameId: string;
  timestampSec: number;
  note: string;
};

export type IdentityConfirmationState = 'pending' | 'confirmed' | 'rejected' | 'insufficient';

export type IdentityConfirmation = {
  state: IdentityConfirmationState;
  frameIds: string[];
  confirmedAt: string | null;
};

export type AnalysisConfidenceDimensions = {
  videoQuality: AnalysisConfidenceBand;
  playerIdentity: AnalysisConfidenceBand;
  cameraCoverage: AnalysisConfidenceBand;
  trackingStability: AnalysisConfidenceBand;
  eventConfidence: AnalysisConfidenceBand;
  overallCoverage: AnalysisConfidenceBand;
};

export type AnalysisPreprocessing = {
  durationSec: number;
  fileSizeBytes: number | null;
  sampledFrameCount: number;
  warnings: string[];
};

export type AnalysisLease = {
  holder: string;
  until: string;
};

export type CoachingMoment = {
  id: string;
  timestampSec: number | null;
  eventIds: string[];
  context: string;
  observationKind: EvidenceKind;
  coachingPoint: string;
  practiceIdea: string | null;
  measurement: string | null;
  confidenceLabel: AnalysisConfidenceBand;
  evidenceRefs: string[];
};

export type SampledCoverage = {
  sampledFrameCount: number;
  identifiedFrameCount: number;
  confidenceLabel: AnalysisConfidenceBand;
};

export type TechniqueDimension =
  | 'weakFoot'
  | 'skillMoves'
  | 'firstTouch'
  | 'passing'
  | 'dribbling'
  | 'shooting';

export type TechniqueRatingStatus = 'rated' | 'insufficient_evidence' | 'identity_unconfirmed';

/** 1–5 star read of one technique. `stars` is null unless enough cited frames showed it. */
export type TechniqueRating = {
  dimension: TechniqueDimension;
  stars: number | null;
  status: TechniqueRatingStatus;
  summary: string;
  tip: string | null;
  frameIds: string[];
  confidence: 'Limited' | 'Insufficient';
};

export type TechniqueAssessment = {
  scale: 'stars_1_5';
  basis: 'sampled_frames';
  ratings: TechniqueRating[];
  ratedCount: number;
  overallSummary: string;
  selfReported: {
    strongFoot: string | null;
    weakFoot: number | null;
    skillMoves: number | null;
  };
};

export type MatchAnalysisReport = {
  headline: string;
  strengths: string[];
  improvements: string[];
  coachingNotes: string;
  estimatedStats: MatchEstimatedStats;
  /** Absent on reports generated before technique stars existed. */
  techniqueAssessment?: TechniqueAssessment;
  moments: MatchMomentsInsight[];
  coverage: MatchAnalysisCoverage;
  sampledCoverage?: SampledCoverage;
  evidence: MatchAnalysisEvidencePoint[];
  events?: MatchAnalysisEvent[];
  coachingMoments?: CoachingMoment[];
  pipelineStages: MatchAnalysisPipelineStage[];
  segments: MatchSegment[];
  availability: PlayerAvailabilityWindow[];
  confidenceDimensions?: AnalysisConfidenceDimensions;
  tacticalSummary?: string;
  /** Qualitative overall band is preferred; numeric is only kept when the model supplied it. */
  confidence: number | null;
  /** Short disclaimer for UI */
  methodology: string;
  modelId: string;
  generatedAt: string;
};

export type MatchFrameSample = {
  id: string;
  index: number;
  timestampSec: number;
  storagePath: string;
  downloadUrl: string;
};

/** Mirrors ProbeSummary in functions/src/uploads/probe.ts. */
export type VideoProbeSummary = {
  container: 'mp4' | 'mov';
  videoCodec: string;
  audioCodec: string | null;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  bitRate: number | null;
  sizeBytes: number;
  streamCount: number;
};

export type MatchAnalysisJob = {
  id: string;
  playerId: string;
  status: MatchAnalysisJobStatus;
  targeting: PlayerTargeting;
  match: MatchContextInput;
  durationSec: number;
  fileSizeBytes?: number;
  /** Server-set after ffprobe validation and promotion out of quarantine. */
  videoStoragePath?: string;
  videoUploadId?: string;
  videoProbe?: VideoProbeSummary;
  measuredDurationSec?: number;
  videoDownloadUrl?: string;
  frames: MatchFrameSample[];
  identityCandidates?: IdentityCandidate[];
  identityConfirmation?: IdentityConfirmation;
  confidenceDimensions?: AnalysisConfidenceDimensions;
  preprocessing?: AnalysisPreprocessing;
  idempotencyKey?: string;
  lease?: AnalysisLease;
  attempts?: number;
  cancelRequested?: boolean;
  events?: MatchAnalysisEvent[];
  uploadProgress?: number;
  phaseLabel?: string;
  pipelineStages?: MatchAnalysisPipelineStage[];
  segments?: MatchSegment[];
  availability?: PlayerAvailabilityWindow[];
  error?: string;
  report?: MatchAnalysisReport;
  /** Player-marked alignment between this footage and a GPS session. */
  videoSync?: MatchVideoSync;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type MatchVideoSync = {
  gpsSessionId: string;
  /** GPS time (epoch ms) that the marked video moment corresponds to. */
  gpsAnchorMs: number;
  videoAnchorSec: number;
  setAt: string;
};

export type CreateMatchAnalysisInput = {
  localVideoUri: string;
  fileName?: string;
  durationSec: number;
  fileSizeBytes?: number;
  targeting: PlayerTargeting;
  match: MatchContextInput;
};

export function emptyEstimatedStats(): MatchEstimatedStats {
  return {
    minutesPlayed: null,
    goals: null,
    assists: null,
    shots: null,
    shotsOnTarget: null,
    passesAttempted: null,
    passesCompleted: null,
    passCompletionPct: null,
    keyPasses: null,
    tackles: null,
    duelsWon: null,
    duelsLost: null,
    foulsCommitted: null,
    yellowCards: null,
    redCards: null,
    matchRating: null,
    cleanSheet: null,
  };
}

export function buildDefaultAnalysisCoverage(): MatchAnalysisCoverage {
  return {
    visiblePct: 0,
    likelyOffCameraPct: 0,
    unknownPct: 100,
    confidenceLabel: 'Insufficient',
    note: 'No reliable player evidence was available for the full match.',
  };
}

const CV_UNAVAILABLE_NOTE =
  'This stage needs a computer-vision worker that is not deployed. It is marked unavailable rather than guessed.';

export function buildDefaultPipelineStages(): MatchAnalysisPipelineStage[] {
  return [
    { id: 'video-ingestion', label: 'Preparing video', status: 'complete' },
    {
      id: 'match-segmentation',
      label: 'Finding match segments',
      status: 'unavailable',
      note: CV_UNAVAILABLE_NOTE,
    },
    { id: 'player-identification', label: 'Identifying players in sampled frames', status: 'pending' },
    { id: 'identity-confirmation', label: 'Confirm this is you', status: 'pending' },
    {
      id: 'player-tracking',
      label: 'Continuous player tracking',
      status: 'unavailable',
      note: CV_UNAVAILABLE_NOTE,
    },
    {
      id: 'event-detection',
      label: 'Computer-vision event detection',
      status: 'unavailable',
      note: CV_UNAVAILABLE_NOTE,
    },
    {
      id: 'tactical-context',
      label: 'Tactical phase and pitch mapping',
      status: 'unavailable',
      note: CV_UNAVAILABLE_NOTE,
    },
    {
      id: 'role-analysis',
      label: 'Role execution from tracking',
      status: 'unavailable',
      note: CV_UNAVAILABLE_NOTE,
    },
    {
      id: 'cross-event-reasoning',
      label: 'Connecting detected events',
      status: 'unavailable',
      note: 'No validated event stream exists until event detection is available.',
    },
    { id: 'coaching-synthesis', label: 'Building coaching feedback', status: 'pending' },
    { id: 'validation', label: 'Validating evidence', status: 'pending' },
    { id: 'final-report', label: 'Finalizing report', status: 'pending' },
  ];
}

export function hasApplyableEstimatedStats(stats: MatchEstimatedStats): boolean {
  return (
    stats.minutesPlayed !== null &&
    stats.goals !== null &&
    stats.assists !== null &&
    stats.shots !== null &&
    stats.tackles !== null
  );
}

/**
 * Only writes a match log when the core countable fields were actually estimated.
 * Null counts are not converted to zero — that would invent football events.
 */
export function estimatedStatsToMatchLogPayload(
  match: MatchContextInput,
  stats: MatchEstimatedStats,
  notes: string,
): MatchLogPayload | null {
  if (!hasApplyableEstimatedStats(stats) || stats.minutesPlayed === null || stats.goals === null || stats.assists === null || stats.shots === null || stats.tackles === null) {
    return null;
  }
  return {
    date: match.date,
    opponent: match.opponent,
    competition: match.competition,
    result: match.result?.trim() || 'N/A',
    minutes: Math.max(0, Math.round(stats.minutesPlayed)),
    goals: Math.max(0, Math.round(stats.goals)),
    assists: Math.max(0, Math.round(stats.assists)),
    cleanSheet: stats.cleanSheet === true,
    passAccuracy: stats.passCompletionPct === null
      ? null
      : Math.max(0, Math.min(100, Math.round(stats.passCompletionPct))),
    shots: Math.max(0, Math.round(stats.shots)),
    tackles: Math.max(0, Math.round(stats.tackles)),
    yellowCards: stats.yellowCards === null ? 0 : Math.max(0, Math.round(stats.yellowCards)),
    redCards: stats.redCards === null ? 0 : Math.max(0, Math.round(stats.redCards)),
    matchRating: stats.matchRating === null
      ? null
      : Math.max(1, Math.min(10, Number(stats.matchRating.toFixed(1)))),
    notes,
  };
}

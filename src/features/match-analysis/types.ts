import { type MatchLogPayload } from '@/features/player-statistics/types';

export type MatchAnalysisJobStatus =
  | 'draft'
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'complete'
  | 'failed';

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

/** AI-estimated counting stats for the nominated player only. */
export type MatchEstimatedStats = {
  minutesPlayed: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  passesAttempted: number;
  passesCompleted: number;
  passCompletionPct: number;
  keyPasses: number;
  tackles: number;
  duelsWon: number;
  duelsLost: number;
  foulsCommitted: number;
  yellowCards: number;
  redCards: number;
  matchRating: number;
  cleanSheet: boolean;
};

export type MatchMomentsInsight = {
  timestampSec: number;
  label: string;
  detail: string;
};

export type MatchAnalysisReport = {
  headline: string;
  strengths: string[];
  improvements: string[];
  coachingNotes: string;
  estimatedStats: MatchEstimatedStats;
  moments: MatchMomentsInsight[];
  /** 0–1 overall confidence that the model tracked the right player / events */
  confidence: number;
  /** Short disclaimer for UI */
  methodology: string;
  modelId: string;
  generatedAt: string;
};

export type MatchFrameSample = {
  index: number;
  timestampSec: number;
  storagePath: string;
  downloadUrl: string;
};

export type MatchAnalysisJob = {
  id: string;
  playerId: string;
  status: MatchAnalysisJobStatus;
  targeting: PlayerTargeting;
  match: MatchContextInput;
  durationSec: number;
  fileSizeBytes?: number;
  videoStoragePath?: string;
  videoDownloadUrl?: string;
  frames: MatchFrameSample[];
  uploadProgress?: number;
  error?: string;
  report?: MatchAnalysisReport;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type CreateMatchAnalysisInput = {
  localVideoUri: string;
  durationSec: number;
  fileSizeBytes?: number;
  targeting: PlayerTargeting;
  match: MatchContextInput;
};

export function emptyEstimatedStats(): MatchEstimatedStats {
  return {
    minutesPlayed: 0,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    passCompletionPct: 0,
    keyPasses: 0,
    tackles: 0,
    duelsWon: 0,
    duelsLost: 0,
    foulsCommitted: 0,
    yellowCards: 0,
    redCards: 0,
    matchRating: 6,
    cleanSheet: false,
  };
}

export function estimatedStatsToMatchLogPayload(
  match: MatchContextInput,
  stats: MatchEstimatedStats,
  notes: string,
): MatchLogPayload {
  return {
    date: match.date,
    opponent: match.opponent,
    competition: match.competition,
    result: match.result?.trim() || 'N/A',
    minutes: Math.max(0, Math.round(stats.minutesPlayed)),
    goals: Math.max(0, Math.round(stats.goals)),
    assists: Math.max(0, Math.round(stats.assists)),
    cleanSheet: stats.cleanSheet,
    passAccuracy: Math.max(0, Math.min(100, Math.round(stats.passCompletionPct))),
    shots: Math.max(0, Math.round(stats.shots)),
    tackles: Math.max(0, Math.round(stats.tackles)),
    yellowCards: Math.max(0, Math.round(stats.yellowCards)),
    redCards: Math.max(0, Math.round(stats.redCards)),
    matchRating: Math.max(1, Math.min(10, Number(stats.matchRating.toFixed(1)))),
    notes,
  };
}

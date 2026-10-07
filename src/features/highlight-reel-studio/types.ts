import type { AnalysisConfidenceBand } from '@/features/match-analysis/types';

export type HighlightReelPreset =
  | 'best-of'
  | 'scout'
  | 'social'
  | 'tactical'
  | 'development';

export type HighlightCandidateStatus = 'verified' | 'high-confidence' | 'needs-confirmation';

export type HighlightEventKind =
  | 'progressivePass'
  | 'progressiveCarry'
  | 'goal'
  | 'recovery'
  | 'save'
  | 'defensiveAction'
  | 'dribble'
  | 'shot'
  | 'matchAction';

export type HighlightCandidate = {
  id: string;
  /** Model-provided label; empty when the model gave none. */
  title: string;
  eventKind: HighlightEventKind;
  category: 'technical' | 'tactical' | 'physical' | 'story';
  /** Model-provided detail; empty when the model gave none. */
  description: string;
  timestampSec: number;
  confidence: number;
  highlightValue: number;
  status: HighlightCandidateStatus;
  matchId?: string;
  source: 'match-analysis' | 'uploaded-clip' | 'manual-selection';
  targetJersey: string | null;
  coverageBand: AnalysisConfidenceBand | null;
};

export type HighlightReelCoverage = 'ai_suggested' | 'none';

export type HighlightReelPlan = {
  preset: HighlightReelPreset;
  targetDurationSec: number;
  candidates: HighlightCandidate[];
  qualityScore: number;
  coverage: HighlightReelCoverage;
};

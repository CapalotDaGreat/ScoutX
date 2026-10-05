export type HighlightReelPreset =
  | 'best-of'
  | 'scout'
  | 'social'
  | 'tactical'
  | 'development';

export type HighlightCandidateStatus = 'verified' | 'high-confidence' | 'needs-confirmation';

export type HighlightCandidate = {
  id: string;
  title: string;
  eventType: string;
  category: 'technical' | 'tactical' | 'physical' | 'story';
  description: string;
  reason: string;
  timestampSec: number;
  confidence: number;
  highlightValue: number;
  status: HighlightCandidateStatus;
  matchId?: string;
  source: 'match-analysis' | 'uploaded-clip' | 'manual-selection';
  evidence: string[];
};

export type HighlightReelPlan = {
  preset: HighlightReelPreset;
  title: string;
  description: string;
  targetDurationSec: number;
  candidates: HighlightCandidate[];
  qualityScore: number;
  coverage: string;
};

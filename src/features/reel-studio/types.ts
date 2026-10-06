export type ReelMode = 'scout' | 'social';
export type ReelStatus = 'draft' | 'review' | 'approved';
export type ReelAspectRatio = '9:16' | '16:9' | '1:1';
export type SuggestionDecision = 'accepted' | 'rejected' | 'pending';

export type ReelSegment = {
  mediaId: string;
  inSec: number;
  outSec: number;
  caption?: string;
  evidenceId?: string;
};

export type ReelAiSuggestion = {
  segmentIndex: number;
  reason: string;
  decision: SuggestionDecision;
};

export type ReelQualityNote = {
  code: string;
  message: string;
};

export type ReelManifest = {
  id: string;
  ownerId: string;
  preset: string;
  mode: ReelMode;
  segments: ReelSegment[];
  title: string;
  coverMediaId: string | null;
  aspectRatio: ReelAspectRatio;
  privacy: 'private' | 'passport' | 'grant';
  status: ReelStatus;
  aiSuggestions: ReelAiSuggestion[];
  quality: { notes: ReelQualityNote[] };
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ReelExportJob = {
  id: string;
  ownerId: string;
  reelId: string;
  status: 'unavailable';
  reason: string;
  createdAt: string;
};

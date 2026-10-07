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

export type ReelQualityCode =
  | 'missing_title'
  | 'no_segments'
  | 'no_cover'
  | 'invalid_trim'
  | 'missing_media'
  | 'pending_suggestions'
  | 'too_long';

export type ReelQualityNote = {
  code: ReelQualityCode;
  message: string;
  segmentIndex?: number;
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

export type ReelExportStatus = 'queued' | 'rendering' | 'ready' | 'failed';

export type ReelExportErrorCode =
  | 'no_segments'
  | 'too_long'
  | 'missing_source'
  | 'invalid_clip'
  | 'unsupported_codec'
  | 'timeout'
  | 'render_failed';

export type ReelExportJob = {
  id: string;
  ownerId: string;
  reelId: string;
  reelVersion: number;
  status: ReelExportStatus;
  errorCode: ReelExportErrorCode | null;
  storagePath: string | null;
  durationSec: number | null;
  sizeBytes: number | null;
  hasCaptions: boolean;
  createdAt: string;
  updatedAt: string;
};

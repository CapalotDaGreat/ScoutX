import type { VideoCategory } from '@/features/highlight-videos/types';

export type MediaItemType = 'matchFootage' | 'clip' | 'highlight' | 'reel';

export type MediaVisibility = 'private' | 'passport' | 'grant';

export type MediaUploadState = 'pending' | 'uploading' | 'ready' | 'failed';

export type MediaProcessingState = 'none' | 'queued' | 'processing' | 'ready' | 'failed' | 'unavailable';

/** Owners move between unconfirmed and user_confirmed; restricted/removed are set by moderation. */
export type MediaRightsState = 'unconfirmed' | 'user_confirmed' | 'restricted' | 'removed';

/** Server-owned. Anything other than none keeps the media private and out of the Passport. */
export type MediaModerationState = 'none' | 'restricted' | 'removed';

export type MediaItem = {
  id: string;
  ownerId: string;
  type: MediaItemType;
  storagePath: string;
  thumbnailPath: string | null;
  durationSec: number;
  sourceMatchId: string | null;
  sourceJobId: string | null;
  visibility: MediaVisibility;
  rightsState: MediaRightsState;
  moderationState: MediaModerationState;
  uploadState: MediaUploadState;
  processingState: MediaProcessingState;
  favorite: boolean;
  tags: string[];
  goalIds: string[];
  title: string;
  /** Football category from the original upload; absent when it was never set. */
  category?: VideoCategory | null;
  /** Opponent or match name as entered at upload. */
  matchLabel?: string | null;
  /** When the footage was recorded, as entered at upload. */
  recordedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MediaGrant = {
  id: string;
  ownerId: string;
  mediaId?: string;
  reelId?: string;
  granteeId: string;
  expiresAt: string;
  createdAt: string;
};

export function isMediaItemType(value: unknown): value is MediaItemType {
  return value === 'matchFootage' || value === 'clip' || value === 'highlight' || value === 'reel';
}

export function parseRightsState(value: unknown): MediaRightsState {
  return value === 'user_confirmed' || value === 'restricted' || value === 'removed' ? value : 'unconfirmed';
}

export function parseModerationState(value: unknown): MediaModerationState {
  return value === 'restricted' || value === 'removed' ? value : 'none';
}

export function parseVisibility(value: unknown): MediaVisibility {
  return value === 'passport' || value === 'grant' ? value : 'private';
}

/** Leaving private requires confirmed rights and no moderation hold. */
export function canLeavePrivate(item: Pick<MediaItem, 'rightsState' | 'moderationState'>): boolean {
  return item.rightsState === 'user_confirmed' && item.moderationState === 'none';
}

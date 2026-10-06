export type MediaItemType = 'matchFootage' | 'clip' | 'highlight' | 'reel';

export type MediaVisibility = 'private' | 'passport' | 'grant';

export type MediaUploadState = 'pending' | 'uploading' | 'ready' | 'failed';

export type MediaProcessingState = 'none' | 'queued' | 'processing' | 'ready' | 'failed' | 'unavailable';

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
  uploadState: MediaUploadState;
  processingState: MediaProcessingState;
  favorite: boolean;
  tags: string[];
  goalIds: string[];
  title: string;
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

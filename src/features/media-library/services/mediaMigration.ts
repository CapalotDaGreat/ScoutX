import type { HighlightVideo } from '@/features/highlight-videos/types';
import type { MediaItem } from '@/features/media-library/types';

function uploadState(status: HighlightVideo['uploadStatus']): MediaItem['uploadState'] {
  if (status === 'ready') {
    return 'ready';
  }
  if (status === 'failed') {
    return 'failed';
  }
  if (status === 'uploading' || status === 'processing') {
    return 'uploading';
  }
  return 'pending';
}

/** Maps a legacy profile highlight into the media subcollection. Token URLs are dropped. */
export function highlightVideoToMediaItem(video: HighlightVideo, ownerId: string): MediaItem {
  return {
    id: video.id,
    ownerId,
    type: 'highlight',
    storagePath: video.storagePath,
    thumbnailPath: video.thumbnailStoragePath ?? null,
    durationSec: Number.isFinite(video.durationSec) ? video.durationSec : 0,
    sourceMatchId: null,
    sourceJobId: null,
    visibility: video.featured ? 'passport' : 'private',
    uploadState: uploadState(video.uploadStatus),
    processingState: 'none',
    favorite: Boolean(video.featured),
    tags: Array.isArray(video.tags) ? video.tags.filter((tag) => typeof tag === 'string') : [],
    goalIds: [],
    title: video.title.trim() || 'Untitled clip',
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
  };
}

export function featuredMediaIdsFromHighlights(videos: HighlightVideo[]): string[] {
  return videos.filter((video) => video.featured && video.uploadStatus === 'ready').map((video) => video.id);
}

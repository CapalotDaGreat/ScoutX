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

/**
 * Maps a legacy profile highlight into the media subcollection. Token URLs are dropped and the
 * item starts private: publishing needs the owner's rights confirmation first.
 */
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
    visibility: 'private',
    rightsState: 'unconfirmed',
    moderationState: 'none',
    uploadState: uploadState(video.uploadStatus),
    processingState: 'none',
    favorite: Boolean(video.featured),
    tags: Array.isArray(video.tags) ? video.tags.filter((tag) => typeof tag === 'string') : [],
    goalIds: [],
    title: video.title.trim() || 'Untitled clip',
    category: video.category ?? null,
    matchLabel: video.opponent?.trim() || video.match?.trim() || null,
    recordedAt: video.date || null,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
  };
}

/**
 * Media migrated before category, match and date were copied lacks them; fill them from the
 * same legacy record (matched by id) without overwriting anything already stored.
 */
export function enrichFromHighlights(items: readonly MediaItem[], videos: readonly HighlightVideo[]): MediaItem[] {
  const byId = new Map(videos.map((video) => [video.id, video]));
  return items.map((item) => {
    const video = byId.get(item.id);
    if (!video) return item;
    return {
      ...item,
      category: item.category ?? video.category ?? null,
      matchLabel: item.matchLabel ?? (video.opponent?.trim() || video.match?.trim() || null),
      recordedAt: item.recordedAt ?? (video.date || null),
    };
  });
}

export function featuredMediaIdsFromHighlights(videos: HighlightVideo[]): string[] {
  return videos.filter((video) => video.featured && video.uploadStatus === 'ready').map((video) => video.id);
}

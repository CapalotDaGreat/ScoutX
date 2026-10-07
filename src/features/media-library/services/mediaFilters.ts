import type { VideoCategory } from '@/features/highlight-videos/types';
import type { MediaItem } from '@/features/media-library/types';
import { clipCategory } from '../../reel-studio/services/reelTemplates';

export type MediaFilter = {
  match: string | null;
  season: string | null;
  category: VideoCategory | null;
  goalLinked: boolean;
  passport: boolean;
  sentAsEvidence: boolean;
};

export const EMPTY_MEDIA_FILTER: MediaFilter = {
  match: null,
  season: null,
  category: null,
  goalLinked: false,
  passport: false,
  sentAsEvidence: false,
};

/** August–July football season label, e.g. "2025/26". */
export function mediaSeason(item: Pick<MediaItem, 'recordedAt' | 'createdAt'>): string | null {
  const date = new Date(item.recordedAt ?? item.createdAt);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCMonth() >= 7 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
}

export function mediaMatchKey(item: Pick<MediaItem, 'sourceMatchId' | 'matchLabel'>): string | null {
  return item.sourceMatchId ?? (item.matchLabel?.trim() || null);
}

export type MediaFacets = {
  matches: Array<{ key: string; label: string }>;
  seasons: string[];
  categories: VideoCategory[];
};

export function mediaFacets(items: readonly MediaItem[]): MediaFacets {
  const matches = new Map<string, string>();
  const seasons = new Set<string>();
  const categories = new Set<VideoCategory>();
  for (const item of items) {
    const key = mediaMatchKey(item);
    if (key) matches.set(key, item.matchLabel?.trim() || key);
    const season = mediaSeason(item);
    if (season) seasons.add(season);
    const category = clipCategory(item);
    if (category) categories.add(category);
  }
  return {
    matches: [...matches.entries()].map(([key, label]) => ({ key, label })),
    seasons: [...seasons].sort().reverse(),
    categories: [...categories],
  };
}

/** `evidenceMediaIds` are media items the player attached to a fulfilled scout request. */
export function filterMedia(
  items: readonly MediaItem[],
  filter: MediaFilter,
  evidenceMediaIds: ReadonlySet<string>,
): MediaItem[] {
  return items.filter(
    (item) =>
      (!filter.match || mediaMatchKey(item) === filter.match) &&
      (!filter.season || mediaSeason(item) === filter.season) &&
      (!filter.category || clipCategory(item) === filter.category) &&
      (!filter.goalLinked || item.goalIds.length > 0) &&
      (!filter.passport || item.visibility === 'passport') &&
      (!filter.sentAsEvidence || evidenceMediaIds.has(item.id)),
  );
}

import type { VideoCategory } from '@/features/highlight-videos/types';
import type { MediaItem } from '@/features/media-library/types';
import type { ReelAspectRatio, ReelMode, ReelSegment } from '@/features/reel-studio/types';
import type { PositionGroup } from '@/features/scout-intelligence/types';

export type ReelTemplateId = 'scout' | 'social' | 'position';

export type ReelTemplate = {
  id: ReelTemplateId;
  mode: ReelMode;
  aspectRatio: ReelAspectRatio;
  maxTotalSec: number;
  maxClipSec: number;
};

export const REEL_TEMPLATES: Record<ReelTemplateId, ReelTemplate> = {
  scout: { id: 'scout', mode: 'scout', aspectRatio: '16:9', maxTotalSec: 90, maxClipSec: 12 },
  social: { id: 'social', mode: 'social', aspectRatio: '9:16', maxTotalSec: 30, maxClipSec: 6 },
  position: { id: 'position', mode: 'scout', aspectRatio: '16:9', maxTotalSec: 60, maxClipSec: 10 },
};

const SCOUT_ORDER: readonly VideoCategory[] = ['goals', 'assists', 'skills', 'passing', 'defending', 'headers', 'goalkeeping'];
const SOCIAL_ORDER: readonly VideoCategory[] = ['goals', 'skills', 'assists'];
const POSITION_ORDER: Record<PositionGroup, readonly VideoCategory[]> = {
  goalkeeper: ['goalkeeping', 'passing'],
  defender: ['defending', 'headers', 'passing'],
  midfielder: ['passing', 'assists', 'skills', 'defending'],
  forward: ['goals', 'assists', 'skills', 'headers'],
};

const CATEGORIES: ReadonlySet<string> = new Set(SCOUT_ORDER);

/** A clip's football category comes from its stored category or an exact category tag. */
export function clipCategory(item: Pick<MediaItem, 'category' | 'tags'>): VideoCategory | null {
  if (item.category) return item.category;
  const tag = item.tags.map((value) => value.trim().toLowerCase()).find((value) => CATEGORIES.has(value));
  return (tag as VideoCategory | undefined) ?? null;
}

export type TemplateBuild =
  | { ok: true; template: ReelTemplate; segments: ReelSegment[]; totalSec: number; coverMediaId: string; untagged: number }
  | { ok: false; reason: 'position_unknown' | 'no_tagged_clips'; untagged: number };

/**
 * Sequences ready, tagged clips by category priority, newest first within a category. Clips
 * without a category are never guessed into one; they are counted so the UI can say so.
 */
export function buildTemplateReel(
  templateId: ReelTemplateId,
  items: readonly MediaItem[],
  positionGroup: PositionGroup | null,
): TemplateBuild {
  const template = REEL_TEMPLATES[templateId];
  const usable = items.filter((item) => item.uploadState === 'ready' && item.durationSec > 0 && item.type !== 'reel');
  const untagged = usable.filter((item) => clipCategory(item) === null).length;
  if (templateId === 'position' && !positionGroup) return { ok: false, reason: 'position_unknown', untagged };

  const order =
    templateId === 'social' ? SOCIAL_ORDER : templateId === 'position' && positionGroup ? POSITION_ORDER[positionGroup] : SCOUT_ORDER;
  const segments: ReelSegment[] = [];
  let totalSec = 0;
  for (const category of order) {
    const clips = usable
      .filter((item) => clipCategory(item) === category)
      .sort((a, b) => (b.recordedAt ?? b.createdAt).localeCompare(a.recordedAt ?? a.createdAt));
    for (const clip of clips) {
      const remaining = template.maxTotalSec - totalSec;
      if (remaining < 1) break;
      const length = Math.min(clip.durationSec, template.maxClipSec, remaining);
      segments.push({ mediaId: clip.id, inSec: 0, outSec: Math.round(length * 10) / 10, caption: template.mode === 'scout' ? clip.title : undefined });
      totalSec += length;
    }
  }
  if (segments.length === 0) return { ok: false, reason: 'no_tagged_clips', untagged };
  return { ok: true, template, segments, totalSec: Math.round(totalSec * 10) / 10, coverMediaId: segments[0].mediaId, untagged };
}

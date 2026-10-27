/**
 * Highlight reels from measured moments. Ranking is evidence-first and deterministic (identity
 * strength, measured action type, verified outcome) - never model praise. Presets only appear
 * when this match has evidence for them. Reels are saved as PRIVATE drafts; nothing is published
 * automatically.
 */
import type { ReelManifest, ReelSegment } from '@/features/reel-studio/types';
import { footageMediaIdFor } from '@/features/highlight-reel-studio/services/reelCandidateService';
import type { MomentCard } from './moments';
import type { PositionGroup } from './coach';

export const HIGHLIGHT_PRESETS = ['my_match', 'attacking', 'ball', 'defensive', 'goalkeeper', 'custom'] as const;
export type HighlightPreset = (typeof HIGHLIGHT_PRESETS)[number];

export type PresetAvailability = { preset: HighlightPreset; available: boolean;
  /** why a preset is not offered (shown, so a missing preset is never a mystery) */
  reason: 'no_confirmed_moments' | 'no_measured_actions' | 'defensive_not_validated' | 'not_goalkeeper' | null };

const auto = (c: MomentCard) => c.evidence === 'confirmed' || c.evidence === 'estimated';
const isAction = (c: MomentCard) => c.category === 'on_ball' || c.category === 'passing';

export function presetAvailability(cards: MomentCard[], position: PositionGroup): PresetAvailability[] {
  const usable = cards.filter(auto);
  const actions = usable.filter(isAction);
  return HIGHLIGHT_PRESETS.map((preset): PresetAvailability => {
    switch (preset) {
      case 'my_match':
        return { preset, available: usable.length > 0, reason: usable.length ? null : 'no_confirmed_moments' };
      case 'attacking':
        return { preset, available: actions.some((c) => c.titleKey === 'pass_attempt' || c.titleKey === 'carry'),
          reason: actions.length ? null : 'no_measured_actions' };
      case 'ball':
        return { preset, available: actions.length > 0, reason: actions.length ? null : 'no_measured_actions' };
      case 'defensive':
        // Duel/tackle detections are unvalidated candidates: never auto-compiled into a reel.
        return { preset, available: false, reason: 'defensive_not_validated' };
      case 'goalkeeper':
        return { preset, available: position === 'goalkeeper' && actions.length > 0,
          reason: position !== 'goalkeeper' ? 'not_goalkeeper' : actions.length ? null : 'no_measured_actions' };
      default:
        return { preset, available: cards.length > 0, reason: cards.length ? null : 'no_confirmed_moments' };
    }
  }).map((p): PresetAvailability => (p.available ? { ...p, reason: null } : (p as PresetAvailability)));
}

export type HighlightClip = { momentId: string; inSec: number; outSec: number; evidence: MomentCard['evidence'] };

const MIN_GAP_SEC = 25;

/**
 * Picks clips for a preset up to ~targetSec. Diversity: picks are spread over the match (a new
 * pick must be MIN_GAP_SEC away from earlier ones) and overlapping windows are never repeated.
 * Custom reels use exactly the moments the player selected, including ones marked for review.
 */
export function selectHighlights(cards: MomentCard[], preset: HighlightPreset, targetSec = 60,
  customIds: string[] = []): HighlightClip[] {
  let pool: MomentCard[];
  switch (preset) {
    case 'custom':
      pool = cards.filter((c) => customIds.includes(c.id));
      break;
    case 'attacking':
      pool = cards.filter((c) => auto(c) && (c.titleKey === 'pass_attempt' || c.titleKey === 'carry'));
      break;
    case 'ball':
    case 'goalkeeper':
      pool = cards.filter((c) => auto(c) && isAction(c));
      break;
    case 'defensive':
      pool = [];
      break;
    default:
      pool = cards.filter(auto);
  }
  const ranked = preset === 'custom' ? pool : [...pool].sort((a, b) => b.rank - a.rank || a.clipStart - b.clipStart);
  const picked: MomentCard[] = [];
  let total = 0;
  for (const c of ranked) {
    if (total >= targetSec && preset !== 'custom') break;
    if (picked.some((p) => c.clipStart < p.clipEnd && c.clipEnd > p.clipStart)) continue;
    if (preset !== 'custom' && picked.some((p) => Math.abs(p.actionAt - c.actionAt) < MIN_GAP_SEC)) continue;
    picked.push(c);
    total += c.durationSec;
  }
  return picked.sort((a, b) => a.clipStart - b.clipStart)
    .map((c) => ({ momentId: c.id, inSec: c.clipStart, outSec: c.clipEnd, evidence: c.evidence }));
}

/** Reel segments over the job's validated footage (the existing reel studio exports them). */
export function reelSegmentsFor(jobId: string, clips: HighlightClip[]): ReelSegment[] {
  return clips.map((c) => ({ mediaId: footageMediaIdFor(jobId), inSec: c.inSec, outSec: c.outSec, evidenceId: c.momentId }));
}

/** A private draft reel (never published automatically; sharing follows the reel's own privacy flow). */
export function draftReel(ownerId: string, jobId: string, preset: HighlightPreset, clips: HighlightClip[], title: string,
  now: Date, id: string): ReelManifest {
  const segments = reelSegmentsFor(jobId, clips);
  const at = now.toISOString();
  return {
    id, ownerId, preset: `review-${preset}`, mode: 'scout', segments, title,
    coverMediaId: segments[0]?.mediaId ?? null, aspectRatio: '16:9', privacy: 'private', status: 'draft',
    aiSuggestions: [], quality: { notes: [] }, version: 0, createdAt: at, updatedAt: at,
  };
}

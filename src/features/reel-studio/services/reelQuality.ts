import type { ReelManifest, ReelQualityNote, ReelSegment } from '@/features/reel-studio/types';

export const REEL_MAX_SEC = 90;

export function buildReelQualityNotes(reel: Pick<ReelManifest, 'segments' | 'coverMediaId' | 'title' | 'aiSuggestions'>): ReelQualityNote[] {
  const notes: ReelQualityNote[] = [];
  if (!reel.title.trim()) {
    notes.push({ code: 'missing_title', message: 'Add a title before review.' });
  }
  if (reel.segments.length === 0) {
    notes.push({ code: 'no_segments', message: 'This reel has no clips yet.' });
  }
  if (!reel.coverMediaId) {
    notes.push({ code: 'no_cover', message: 'Pick a cover frame from an existing clip.' });
  }
  for (const [index, segment] of reel.segments.entries()) {
    if (segment.outSec <= segment.inSec) {
      notes.push({ code: 'invalid_trim', message: `Clip ${index + 1} has an empty trim window.`, segmentIndex: index });
    }
    if (!segment.mediaId) {
      notes.push({ code: 'missing_media', message: `Clip ${index + 1} is not bound to a media item.`, segmentIndex: index });
    }
  }
  const totalSec = reel.segments.reduce((sum, segment) => sum + Math.max(0, segment.outSec - segment.inSec), 0);
  if (totalSec > REEL_MAX_SEC) {
    notes.push({ code: 'too_long', message: `Reels can be at most ${REEL_MAX_SEC} seconds.` });
  }
  const pending = reel.aiSuggestions.filter((item) => item.decision === 'pending');
  if (pending.length > 0) {
    notes.push({ code: 'pending_suggestions', message: 'Accept or reject AI suggestions before approval.' });
  }
  return notes;
}

export function canApproveReel(notes: ReelQualityNote[]): boolean {
  return notes.length === 0;
}

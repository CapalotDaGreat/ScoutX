import type { ReelSegment } from '@/features/reel-studio/types';

export type SequencedReel = {
  segments: ReelSegment[];
  totalDurationSec: number;
  overlapCount: number;
};

/**
 * Orders segments by in-point and reports overlaps. Overlaps are not auto-fixed.
 */
export function sequenceReelSegments(segments: ReelSegment[]): SequencedReel {
  const ordered = [...segments].sort((a, b) => a.inSec - b.inSec || a.outSec - b.outSec);
  let overlapCount = 0;
  let totalDurationSec = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const segment = ordered[index];
    const duration = Math.max(0, segment.outSec - segment.inSec);
    totalDurationSec += duration;
    const previous = ordered[index - 1];
    if (previous && segment.inSec < previous.outSec) {
      overlapCount += 1;
    }
  }
  return { segments: ordered, totalDurationSec, overlapCount };
}

export function moveSegment(segments: ReelSegment[], fromIndex: number, toIndex: number): ReelSegment[] {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= segments.length || toIndex >= segments.length) {
    return [...segments];
  }
  const next = [...segments];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function trimSegment(segment: ReelSegment, inSec: number, outSec: number): ReelSegment {
  const start = Math.max(0, inSec);
  const end = Math.max(start, outSec);
  return { ...segment, inSec: start, outSec: end };
}

import type {
  IdentityCandidate,
  IdentityConfirmation,
  MatchFrameSample,
} from '@/features/match-analysis/types';

export function pendingIdentityConfirmation(): IdentityConfirmation {
  return { state: 'pending', frameIds: [], confirmedAt: null };
}

const MAX_CANDIDATES = 8;

/** Up to eight frames spread evenly over the match, so identity is checked across the whole video. */
export function candidatesFromFrames(frames: MatchFrameSample[]): IdentityCandidate[] {
  const sorted = [...frames].sort((a, b) => a.timestampSec - b.timestampSec);
  const picked =
    sorted.length <= MAX_CANDIDATES
      ? sorted
      : Array.from({ length: MAX_CANDIDATES }, (_, i) => sorted[Math.round((i * (sorted.length - 1)) / (MAX_CANDIDATES - 1))]);
  return picked.map((frame) => ({
    frameId: frame.id,
    timestampSec: frame.timestampSec,
    note: `Sampled frame at ${frame.timestampSec}s`,
  }));
}

export function confirmIdentity(frameIds: string[], nowIso: string): IdentityConfirmation {
  const unique = [...new Set(frameIds.filter((id) => id.trim().length > 0))];
  if (unique.length === 0) {
    return { state: 'insufficient', frameIds: [], confirmedAt: null };
  }
  return { state: 'confirmed', frameIds: unique, confirmedAt: nowIso };
}

export function rejectIdentity(): IdentityConfirmation {
  return { state: 'rejected', frameIds: [], confirmedAt: null };
}

export function isIdentityConfirmed(value: IdentityConfirmation | undefined): boolean {
  return value?.state === 'confirmed' && value.frameIds.length > 0;
}

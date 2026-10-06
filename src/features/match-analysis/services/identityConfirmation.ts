import type {
  IdentityCandidate,
  IdentityConfirmation,
  MatchFrameSample,
} from '@/features/match-analysis/types';

export function pendingIdentityConfirmation(): IdentityConfirmation {
  return { state: 'pending', frameIds: [], confirmedAt: null };
}

export function candidatesFromFrames(frames: MatchFrameSample[]): IdentityCandidate[] {
  return frames.slice(0, 8).map((frame) => ({
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

import type { MediaItem } from '@/features/media-library/types';
import type { MatchAnalysisJob, MatchEventType } from '@/features/match-analysis/types';
import type { ReelSegment } from '@/features/reel-studio/types';

export type ClipProofState =
  | 'source_missing'
  | 'unlinked'
  | 'match_linked'
  | 'event_accepted'
  | 'event_rejected'
  | 'event_needs_identity'
  | 'event_missing';

export type ClipProof = {
  state: ClipProofState;
  jobId: string | null;
  matchLabel: string | null;
  inSec: number;
  outSec: number;
  eventType: MatchEventType | null;
  eventTimestampSec: number | null;
};

/**
 * Where a reel clip comes from: its media item, the analysed match it was cut from, and the
 * validation status of the linked event. Nothing is marked as evidence without a stored link.
 */
export function buildClipProof(
  segment: ReelSegment,
  media: MediaItem | undefined,
  job: MatchAnalysisJob | null | undefined,
): ClipProof {
  const base = { inSec: segment.inSec, outSec: segment.outSec, eventType: null, eventTimestampSec: null };
  if (!media) return { ...base, state: 'source_missing', jobId: null, matchLabel: null };
  const jobId = media.sourceJobId;
  const matchLabel = job?.match.opponent.trim() || media.matchLabel?.trim() || null;
  if (!jobId) return { ...base, state: 'unlinked', jobId: null, matchLabel };
  if (!segment.evidenceId) return { ...base, state: 'match_linked', jobId, matchLabel };

  const events = job?.events ?? job?.report?.events ?? [];
  const event = events.find((item) => item.eventId === segment.evidenceId);
  if (!event) return { ...base, state: 'event_missing', jobId, matchLabel };
  const state: ClipProofState =
    event.validationStatus === 'accepted'
      ? 'event_accepted'
      : event.validationStatus === 'rejected'
        ? 'event_rejected'
        : 'event_needs_identity';
  return { ...base, state, jobId, matchLabel, eventType: event.type, eventTimestampSec: event.videoTimestampSec };
}

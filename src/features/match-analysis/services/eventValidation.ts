import type {
  AnalysisConfidenceBand,
  IdentityConfirmation,
  MatchAnalysisEvent,
  MatchEventType,
  MatchFrameSample,
  SampledCoverage,
} from '@/features/match-analysis/types';

export type EventDraft = {
  eventId?: string;
  videoTimestampSec: number;
  type: MatchEventType;
  playerIdentityConfidence?: AnalysisConfidenceBand;
  eventConfidence?: AnalysisConfidenceBand;
  visibilityState?: MatchAnalysisEvent['visibilityState'];
  tacticalPhase?: string | null;
  fieldZone?: string | null;
  evidenceRefs?: string[];
};

const DEDUPE_WINDOW_SEC = 2;
const EVENT_TYPES: readonly MatchEventType[] = [
  'shot',
  'goal',
  'assist',
  'pass',
  'key_pass',
  'tackle',
  'duel',
  'foul',
  'card',
  'save',
  'other',
];

export function isMatchEventType(value: unknown): value is MatchEventType {
  return typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value);
}

function frameIdsForTimestamp(frames: MatchFrameSample[], timestampSec: number): string[] {
  return frames
    .filter((frame) => Math.abs(frame.timestampSec - timestampSec) <= 8)
    .map((frame) => frame.id);
}

/**
 * Drops events that are not bound to known frames, not visible, or duplicated.
 * Identity-unconfirmed jobs never produce accepted events.
 */
export function validateEvents(
  drafts: EventDraft[],
  frames: MatchFrameSample[],
  identity: IdentityConfirmation | undefined,
): MatchAnalysisEvent[] {
  const knownFrameIds = new Set(frames.map((frame) => frame.id));
  const identityOk = identity?.state === 'confirmed' && identity.frameIds.length > 0;
  const accepted: MatchAnalysisEvent[] = [];

  const sorted = [...drafts].sort((a, b) => a.videoTimestampSec - b.videoTimestampSec);

  for (const draft of sorted) {
    const eventId = draft.eventId && draft.eventId.trim() ? draft.eventId : `evt_${accepted.length + 1}`;
    const refs = (draft.evidenceRefs ?? frameIdsForTimestamp(frames, draft.videoTimestampSec)).filter(
      (id) => knownFrameIds.has(id),
    );
    const visibility = draft.visibilityState ?? 'unknown';

    if (refs.length === 0) {
      accepted.push({
        eventId,
        videoTimestampSec: draft.videoTimestampSec,
        matchTimestamp: null,
        type: draft.type,
        playerIdentityConfidence: draft.playerIdentityConfidence ?? 'Insufficient',
        eventConfidence: 'Insufficient',
        visibilityState: visibility,
        tacticalPhase: draft.tacticalPhase ?? null,
        fieldZone: draft.fieldZone ?? null,
        evidenceRefs: [],
        validationStatus: 'rejected',
        rejectionReason: 'No sampled frame is bound to this event.',
      });
      continue;
    }

    if (!identityOk) {
      accepted.push({
        eventId,
        videoTimestampSec: draft.videoTimestampSec,
        matchTimestamp: null,
        type: draft.type,
        playerIdentityConfidence: 'Insufficient',
        eventConfidence: draft.eventConfidence ?? 'Limited',
        visibilityState: visibility,
        tacticalPhase: draft.tacticalPhase ?? null,
        fieldZone: draft.fieldZone ?? null,
        evidenceRefs: refs,
        validationStatus: 'needs_identity',
        rejectionReason: 'Player identity is not confirmed.',
      });
      continue;
    }

    if (visibility !== 'confirmed_visible') {
      accepted.push({
        eventId,
        videoTimestampSec: draft.videoTimestampSec,
        matchTimestamp: null,
        type: draft.type,
        playerIdentityConfidence: draft.playerIdentityConfidence ?? 'Limited',
        eventConfidence: 'Insufficient',
        visibilityState: visibility,
        tacticalPhase: draft.tacticalPhase ?? null,
        fieldZone: draft.fieldZone ?? null,
        evidenceRefs: refs,
        validationStatus: 'rejected',
        rejectionReason: 'The player was not confirmed visible at this timestamp.',
      });
      continue;
    }

    const duplicate = accepted.find(
      (event) =>
        event.validationStatus === 'accepted' &&
        event.type === draft.type &&
        Math.abs(event.videoTimestampSec - draft.videoTimestampSec) <= DEDUPE_WINDOW_SEC,
    );
    if (duplicate) {
      accepted.push({
        eventId,
        videoTimestampSec: draft.videoTimestampSec,
        matchTimestamp: null,
        type: draft.type,
        playerIdentityConfidence: draft.playerIdentityConfidence ?? 'Limited',
        eventConfidence: draft.eventConfidence ?? 'Limited',
        visibilityState: visibility,
        tacticalPhase: draft.tacticalPhase ?? null,
        fieldZone: draft.fieldZone ?? null,
        evidenceRefs: refs,
        validationStatus: 'rejected',
        rejectionReason: 'Duplicate of a nearby accepted event.',
      });
      continue;
    }

    accepted.push({
      eventId,
      videoTimestampSec: draft.videoTimestampSec,
      matchTimestamp: null,
      type: draft.type,
      playerIdentityConfidence: draft.playerIdentityConfidence ?? 'Limited',
      eventConfidence: draft.eventConfidence ?? 'Limited',
      visibilityState: visibility,
      tacticalPhase: draft.tacticalPhase ?? null,
      fieldZone: draft.fieldZone ?? null,
      evidenceRefs: refs,
      validationStatus: 'accepted',
    });
  }

  return accepted;
}

export function sampledCoverageFromEvents(
  frames: MatchFrameSample[],
  events: MatchAnalysisEvent[],
): SampledCoverage {
  const identified = new Set<string>();
  for (const event of events) {
    if (event.validationStatus !== 'accepted') {
      continue;
    }
    for (const frameId of event.evidenceRefs) {
      identified.add(frameId);
    }
  }
  const sampledFrameCount = frames.length;
  const identifiedFrameCount = identified.size;
  let confidenceLabel: AnalysisConfidenceBand = 'Insufficient';
  if (sampledFrameCount >= 6 && identifiedFrameCount >= 8) {
    confidenceLabel = 'Good';
  } else if (sampledFrameCount >= 6 && identifiedFrameCount >= 3) {
    confidenceLabel = 'Limited';
  }
  return { sampledFrameCount, identifiedFrameCount, confidenceLabel };
}

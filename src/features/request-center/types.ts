export type PlayerRequestSource = 'scout_evidence' | 'trial_invitation' | 'verification';

export type PlayerRequestStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'declined'
  | 'expired';

export type PlayerRequestNextAction = 'fulfill' | 'respond' | 'wait' | 'none';

export type EvidenceAttachmentKind = 'match' | 'media' | 'analysis' | 'gps';

export type EvidenceAttachment = { kind: EvidenceAttachmentKind; id: string };

/** One row in the Request Center, whatever produced it. */
export type PlayerRequest = {
  id: string;
  source: PlayerRequestSource;
  /** Source document id (evidence request, trial or verification request). */
  entityId: string;
  createdAt: string;
  status: PlayerRequestStatus;
  /** Requested evidence kinds; empty when the source does not ask for evidence. */
  requested: string[];
  message: string;
  response: { attachments: EvidenceAttachment[]; note: string; at: string } | null;
  expiresAt: string | null;
  nextAction: PlayerRequestNextAction;
  /** Short context: club for trials, requester for verification. */
  context: string;
  /** Requesting scout for evidence requests, so the player can report the request. */
  scoutId?: string;
};

export type StoredEvidenceRequest = {
  id: string;
  scoutId: string;
  playerId: string;
  kinds: string[];
  message: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  response?: { attachments?: unknown; note?: unknown; fulfilledAt?: unknown } | null;
};

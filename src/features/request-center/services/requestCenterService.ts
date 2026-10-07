import type {
  EvidenceAttachment,
  EvidenceAttachmentKind,
  PlayerRequest,
  PlayerRequestStatus,
  StoredEvidenceRequest,
} from '@/features/request-center/types';

/** Open evidence requests expire after 30 days so stale asks do not linger as "pending". */
export const EVIDENCE_REQUEST_TTL_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const ATTACHMENT_KINDS: readonly EvidenceAttachmentKind[] = ['match', 'media', 'analysis', 'gps'];

export type TrialLike = {
  id: string;
  status: string;
  club: string;
  notes?: string;
  scheduledDate: string;
  createdAt: string;
};

export type VerificationLike = {
  id: string;
  status: string;
  evidence: string;
  createdAt: string;
  /** When the request was last reviewed or changed. */
  updatedAt?: string;
};

function addDays(iso: string, days: number): string | null {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : new Date(time + days * DAY_MS).toISOString();
}

function parseAttachments(value: unknown): EvidenceAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    const kind = row?.kind;
    return typeof row?.id === 'string' && ATTACHMENT_KINDS.includes(kind as EvidenceAttachmentKind)
      ? [{ kind: kind as EvidenceAttachmentKind, id: row.id }]
      : [];
  });
}

export function mapEvidenceRequest(request: StoredEvidenceRequest, now: Date): PlayerRequest {
  const expiresAt = addDays(request.createdAt, EVIDENCE_REQUEST_TTL_DAYS);
  let status: PlayerRequestStatus;
  if (request.status === 'fulfilled') status = 'completed';
  else if (request.status === 'declined') status = 'declined';
  else if (expiresAt && Date.parse(expiresAt) < now.getTime()) status = 'expired';
  else status = 'pending';

  const response = request.response
    ? {
        attachments: parseAttachments(request.response.attachments),
        note: typeof request.response.note === 'string' ? request.response.note : '',
        at: typeof request.response.fulfilledAt === 'string' ? request.response.fulfilledAt : request.updatedAt,
      }
    : null;

  return {
    id: `evidence:${request.id}`,
    source: 'scout_evidence',
    entityId: request.id,
    createdAt: request.createdAt,
    status,
    requested: request.kinds,
    message: request.message,
    response,
    expiresAt,
    nextAction: status === 'pending' ? 'fulfill' : 'none',
    context: '',
  };
}

export function mapTrialInvitation(trial: TrialLike, now: Date): PlayerRequest {
  const scheduled = Date.parse(trial.scheduledDate);
  const past = !Number.isNaN(scheduled) && scheduled < now.getTime();
  let status: PlayerRequestStatus;
  switch (trial.status) {
    case 'accepted':
    case 'rescheduled':
      status = past ? 'in_progress' : 'accepted';
      break;
    case 'completed':
      status = 'completed';
      break;
    case 'declined':
    case 'cancelled':
      status = 'declined';
      break;
    default:
      status = past ? 'expired' : 'pending';
  }
  return {
    id: `trial:${trial.id}`,
    source: 'trial_invitation',
    entityId: trial.id,
    createdAt: trial.createdAt,
    status,
    requested: [],
    message: trial.notes ?? '',
    response: null,
    expiresAt: Number.isNaN(scheduled) ? null : trial.scheduledDate,
    nextAction: status === 'pending' ? 'respond' : 'none',
    context: trial.club,
  };
}

export function mapVerificationRequest(request: VerificationLike): PlayerRequest {
  const status: PlayerRequestStatus =
    request.status === 'approved' ? 'completed' : request.status === 'rejected' ? 'declined' : 'in_progress';
  return {
    id: `verification:${request.id}`,
    source: 'verification',
    entityId: request.id,
    createdAt: request.createdAt,
    status,
    requested: [],
    message: request.evidence,
    response: null,
    expiresAt: null,
    nextAction: status === 'in_progress' ? 'wait' : 'none',
    context: '',
  };
}

const STATUS_ORDER: Record<PlayerRequestStatus, number> = {
  pending: 0,
  in_progress: 1,
  accepted: 2,
  completed: 3,
  declined: 4,
  expired: 5,
};

export function buildRequestCenter(
  input: {
    evidenceRequests: readonly StoredEvidenceRequest[];
    trials: readonly TrialLike[];
    verifications: readonly VerificationLike[];
  },
  now: Date = new Date(),
): PlayerRequest[] {
  return [
    ...input.evidenceRequests.map((item) => mapEvidenceRequest(item, now)),
    ...input.trials.map((item) => mapTrialInvitation(item, now)),
    ...input.verifications.map(mapVerificationRequest),
  ].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt.localeCompare(a.createdAt),
  );
}

/** Requests the player must act on, soonest expiry first. */
export function requestsNeedingAttention(requests: readonly PlayerRequest[]): PlayerRequest[] {
  return requests
    .filter((item) => item.nextAction === 'fulfill' || item.nextAction === 'respond')
    .sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999'));
}

/** Which attachment kinds satisfy each requested evidence kind. */
export function attachmentKindsFor(requested: readonly string[]): EvidenceAttachmentKind[] {
  const kinds = new Set<EvidenceAttachmentKind>();
  for (const item of requested) {
    if (item === 'match_footage' || item === 'highlight') kinds.add('media');
    if (item === 'match_footage') kinds.add('analysis');
    if (item === 'statistics' || item === 'coach_note') kinds.add('match');
    if (item === 'gps') kinds.add('gps');
  }
  return kinds.size > 0 ? [...kinds] : [...ATTACHMENT_KINDS];
}

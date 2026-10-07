import type {
  TrialHistoryAction,
  TrialHistoryEntry,
  TrialInvitation,
  TrialInvitationDraft,
  TrialNotification,
  TrialStatus,
} from '@/features/trial-invitations/types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const validStatuses: TrialStatus[] = [
  'pending',
  'accepted',
  'declined',
  'rescheduled',
  'cancelled',
  'completed',
];

const validHistoryActions: TrialHistoryAction[] = [
  'created',
  'accepted',
  'declined',
  'rescheduled',
  'cancelled',
  'completed',
  'note_added',
];

function parseHistoryEntry(value: unknown, index: number): TrialHistoryEntry | null {
  const record = asRecord(value);
  if (!record || typeof record.actorId !== 'string') {
    return null;
  }

  const action = validHistoryActions.includes(record.action as TrialHistoryAction)
    ? (record.action as TrialHistoryAction)
    : 'note_added';

  return {
    id: typeof record.id === 'string' ? record.id : `history-${index}`,
    action,
    actorId: record.actorId,
    actorName: typeof record.actorName === 'string' ? record.actorName : 'Unknown',
    actorRole: record.actorRole === 'player' ? 'player' : 'scout',
    timestamp: typeof record.timestamp === 'string' ? record.timestamp : new Date().toISOString(),
    note: typeof record.note === 'string' ? record.note : undefined,
    previousDate: typeof record.previousDate === 'string' ? record.previousDate : undefined,
    newDate: typeof record.newDate === 'string' ? record.newDate : undefined,
  };
}

function parsePrep(value: unknown): TrialInvitation['prep'] | undefined {
  const record = asRecord(value);
  if (!record || typeof record.notes !== 'string') {
    return undefined;
  }
  return {
    notes: record.notes,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
  };
}

function parseEvaluation(value: unknown): TrialInvitation['evaluation'] | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  const recommendation =
    record.recommendation === 'monitor' ||
    record.recommendation === 'invite' ||
    record.recommendation === 'trial' ||
    record.recommendation === 'pass' ||
    record.recommendation === 'insufficient_evidence'
      ? record.recommendation
      : 'insufficient_evidence';
  const confidenceLabel =
    record.confidenceLabel === 'high' ||
    record.confidenceLabel === 'moderate' ||
    record.confidenceLabel === 'limited' ||
    record.confidenceLabel === 'insufficient'
      ? record.confidenceLabel
      : 'insufficient';
  return {
    roleFit: typeof record.roleFit === 'string' ? record.roleFit : '',
    notes: typeof record.notes === 'string' ? record.notes : '',
    recommendation,
    confidenceLabel,
    evidenceIds: Array.isArray(record.evidenceIds)
      ? record.evidenceIds.filter((item): item is string => typeof item === 'string')
      : [],
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
  };
}

export function parseTrialInvitation(value: unknown, id: string): TrialInvitation | null {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.scoutId !== 'string' ||
    typeof record.playerId !== 'string'
  ) {
    return null;
  }

  const now = new Date().toISOString();
  const status = validStatuses.includes(record.status as TrialStatus)
    ? (record.status as TrialStatus)
    : 'pending';

  const history: TrialHistoryEntry[] = [];
  if (Array.isArray(record.history)) {
    record.history.forEach((item, index) => {
      const entry = parseHistoryEntry(item, index);
      if (entry) {
        history.push(entry);
      }
    });
  }

  return {
    id,
    scoutId: record.scoutId,
    scoutName: typeof record.scoutName === 'string' ? record.scoutName : 'Scout',
    playerId: record.playerId,
    playerName: typeof record.playerName === 'string' ? record.playerName : 'Player',
    club: typeof record.club === 'string' ? record.club : '',
    coach: typeof record.coach === 'string' ? record.coach : '',
    location: typeof record.location === 'string' ? record.location : '',
    scheduledDate: typeof record.scheduledDate === 'string' ? record.scheduledDate : now,
    notes: typeof record.notes === 'string' ? record.notes : '',
    status,
    history,
    prep: parsePrep(record.prep),
    evaluation: parseEvaluation(record.evaluation),
    messageThreadId:
      typeof record.messageThreadId === 'string' ? record.messageThreadId : undefined,
    calendarEventId:
      typeof record.calendarEventId === 'string' ? record.calendarEventId : undefined,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now,
  };
}

// Firestore rejects `undefined` field values, so optional fields are omitted instead.
function withoutUndefined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

export function serializeTrialInvitation(invitation: TrialInvitation): Record<string, unknown> {
  return withoutUndefined({
    scoutId: invitation.scoutId,
    scoutName: invitation.scoutName,
    playerId: invitation.playerId,
    playerName: invitation.playerName,
    club: invitation.club,
    coach: invitation.coach,
    location: invitation.location,
    scheduledDate: invitation.scheduledDate,
    notes: invitation.notes,
    status: invitation.status,
    history: invitation.history.map((entry) => withoutUndefined({ ...entry })),
    prep: invitation.prep,
    evaluation: invitation.evaluation,
    messageThreadId: invitation.messageThreadId,
    calendarEventId: invitation.calendarEventId,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
  });
}

export function parseTrialNotification(value: unknown, id: string): TrialNotification | null {
  const record = asRecord(value);
  if (!record || typeof record.recipientId !== 'string') {
    return null;
  }

  return {
    id,
    recipientId: record.recipientId,
    recipientRole: record.recipientRole === 'scout' ? 'scout' : 'player',
    type:
      record.type === 'message' || record.type === 'system' || record.type === 'trial'
        ? record.type
        : 'trial',
    title: typeof record.title === 'string' ? record.title : '',
    body: typeof record.body === 'string' ? record.body : '',
    trialInvitationId:
      typeof record.trialInvitationId === 'string' ? record.trialInvitationId : undefined,
    messageThreadId:
      typeof record.messageThreadId === 'string' ? record.messageThreadId : undefined,
    read: record.read === true,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
  };
}

export function serializeTrialNotification(notification: TrialNotification): Record<string, unknown> {
  return withoutUndefined({
    recipientId: notification.recipientId,
    recipientRole: notification.recipientRole,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    trialInvitationId: notification.trialInvitationId,
    messageThreadId: notification.messageThreadId,
    read: notification.read,
    createdAt: notification.createdAt,
  });
}

export function createTrialInvitationId(): string {
  return `trial-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createHistoryEntryId(): string {
  return `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createHistoryEntry(
  action: TrialHistoryAction,
  actorId: string,
  actorName: string,
  actorRole: TrialHistoryEntry['actorRole'],
  extras?: Partial<Pick<TrialHistoryEntry, 'note' | 'previousDate' | 'newDate'>>,
): TrialHistoryEntry {
  return {
    id: createHistoryEntryId(),
    action,
    actorId,
    actorName,
    actorRole,
    timestamp: new Date().toISOString(),
    ...extras,
  };
}

export function sortTrialInvitations(invitations: TrialInvitation[]): TrialInvitation[] {
  return [...invitations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function sortTrialNotifications(notifications: TrialNotification[]): TrialNotification[] {
  return [...notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function formatTrialDate(date: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function buildTrialInvitation(
  scoutId: string,
  scoutName: string,
  playerId: string,
  playerName: string,
  draft: TrialInvitationDraft,
): TrialInvitation {
  const now = new Date().toISOString();
  const id = createTrialInvitationId();

  return {
    id,
    scoutId,
    scoutName,
    playerId,
    playerName,
    club: draft.club,
    coach: draft.coach,
    location: draft.location,
    scheduledDate: draft.scheduledDate,
    notes: draft.notes,
    status: 'pending',
    history: [createHistoryEntry('created', scoutId, scoutName, 'scout')],
    messageThreadId: `thread-${id}`,
    createdAt: now,
    updatedAt: now,
  };
}

export function applyTrialAcceptance(
  invitation: TrialInvitation,
  playerId: string,
  playerName: string,
  note?: string,
): TrialInvitation {
  return {
    ...invitation,
    status: 'accepted',
    history: [
      createHistoryEntry('accepted', playerId, playerName, 'player', { note }),
      ...invitation.history,
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function applyTrialDecline(
  invitation: TrialInvitation,
  playerId: string,
  playerName: string,
  note?: string,
): TrialInvitation {
  return {
    ...invitation,
    status: 'declined',
    history: [
      createHistoryEntry('declined', playerId, playerName, 'player', { note }),
      ...invitation.history,
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function applyTrialReschedule(
  invitation: TrialInvitation,
  scoutId: string,
  scoutName: string,
  draft: TrialInvitationDraft,
): TrialInvitation {
  return {
    ...invitation,
    club: draft.club,
    coach: draft.coach,
    location: draft.location,
    scheduledDate: draft.scheduledDate,
    notes: draft.notes,
    status: 'rescheduled',
    history: [
      createHistoryEntry('rescheduled', scoutId, scoutName, 'scout', {
        previousDate: invitation.scheduledDate,
        newDate: draft.scheduledDate,
      }),
      ...invitation.history,
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function applyTrialCancellation(
  invitation: TrialInvitation,
  scoutId: string,
  scoutName: string,
  note?: string,
): TrialInvitation {
  return {
    ...invitation,
    status: 'cancelled',
    history: [
      createHistoryEntry('cancelled', scoutId, scoutName, 'scout', { note }),
      ...invitation.history,
    ],
    updatedAt: new Date().toISOString(),
  };
}

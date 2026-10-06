export type TrialStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'rescheduled'
  | 'cancelled'
  | 'completed';

export type TrialHistoryAction =
  | 'created'
  | 'accepted'
  | 'declined'
  | 'rescheduled'
  | 'cancelled'
  | 'completed'
  | 'note_added';

export type TrialActorRole = 'scout' | 'player';

export type TrialHistoryEntry = {
  id: string;
  action: TrialHistoryAction;
  actorId: string;
  actorName: string;
  actorRole: TrialActorRole;
  timestamp: string;
  note?: string;
  previousDate?: string;
  newDate?: string;
};

export type TrialInvitation = {
  id: string;
  scoutId: string;
  scoutName: string;
  playerId: string;
  playerName: string;
  club: string;
  coach: string;
  location: string;
  scheduledDate: string;
  notes: string;
  status: TrialStatus;
  history: TrialHistoryEntry[];
  prep?: { notes: string; updatedAt: string };
  evaluation?: {
    roleFit: string;
    notes: string;
    recommendation: 'monitor' | 'invite' | 'trial' | 'pass' | 'insufficient_evidence';
    confidenceLabel: 'high' | 'moderate' | 'limited' | 'insufficient';
    evidenceIds: string[];
    createdAt: string;
  };
  messageThreadId?: string;
  calendarEventId?: string;
  createdAt: string;
  updatedAt: string;
};

export type TrialInvitationDraft = {
  club: string;
  coach: string;
  location: string;
  scheduledDate: string;
  notes: string;
};

export type TrialNotificationType = 'trial' | 'message' | 'system';

/** Reserved for future in-app messaging threads. */
export type TrialNotification = {
  id: string;
  recipientId: string;
  recipientRole: TrialActorRole;
  type: TrialNotificationType;
  title: string;
  body: string;
  trialInvitationId?: string;
  messageThreadId?: string;
  read: boolean;
  createdAt: string;
};

export const createEmptyTrialDraft = (): TrialInvitationDraft => ({
  club: '',
  coach: '',
  location: '',
  scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  notes: '',
});

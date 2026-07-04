import {
  createTrialInvitationId,
  formatTrialDate,
} from '@/features/trial-invitations/models/TrialInvitationModel';
import {
  type TrialInvitation,
  type TrialNotification,
  type TrialActorRole,
} from '@/features/trial-invitations/types';

export type TrialNotificationPayload = {
  recipientId: string;
  recipientRole: TrialActorRole;
  title: string;
  body: string;
  trialInvitationId: string;
  messageThreadId?: string;
};

export function buildTrialNotification(payload: TrialNotificationPayload): TrialNotification {
  return {
    id: `notif-${createTrialInvitationId()}`,
    recipientId: payload.recipientId,
    recipientRole: payload.recipientRole,
    type: 'trial',
    title: payload.title,
    body: payload.body,
    trialInvitationId: payload.trialInvitationId,
    messageThreadId: payload.messageThreadId,
    read: false,
    createdAt: new Date().toISOString(),
  };
}

export function buildInvitationCreatedNotifications(
  invitation: TrialInvitation,
): TrialNotification[] {
  return [
    buildTrialNotification({
      recipientId: invitation.playerId,
      recipientRole: 'player',
      title: 'New trial invitation',
      body: `${invitation.scoutName} invited you to trial at ${invitation.club} on ${formatTrialDate(invitation.scheduledDate)}.`,
      trialInvitationId: invitation.id,
      messageThreadId: invitation.messageThreadId,
    }),
    buildTrialNotification({
      recipientId: invitation.scoutId,
      recipientRole: 'scout',
      title: 'Trial invitation sent',
      body: `Invitation sent to ${invitation.playerName} for ${formatTrialDate(invitation.scheduledDate)}.`,
      trialInvitationId: invitation.id,
      messageThreadId: invitation.messageThreadId,
    }),
  ];
}

export function buildInvitationAcceptedNotifications(
  invitation: TrialInvitation,
): TrialNotification[] {
  return [
    buildTrialNotification({
      recipientId: invitation.scoutId,
      recipientRole: 'scout',
      title: 'Trial accepted',
      body: `${invitation.playerName} accepted the trial at ${invitation.club}.`,
      trialInvitationId: invitation.id,
      messageThreadId: invitation.messageThreadId,
    }),
  ];
}

export function buildInvitationDeclinedNotifications(
  invitation: TrialInvitation,
): TrialNotification[] {
  return [
    buildTrialNotification({
      recipientId: invitation.scoutId,
      recipientRole: 'scout',
      title: 'Trial declined',
      body: `${invitation.playerName} declined the trial invitation.`,
      trialInvitationId: invitation.id,
      messageThreadId: invitation.messageThreadId,
    }),
  ];
}

export function buildInvitationRescheduledNotifications(
  invitation: TrialInvitation,
): TrialNotification[] {
  return [
    buildTrialNotification({
      recipientId: invitation.playerId,
      recipientRole: 'player',
      title: 'Trial rescheduled',
      body: `Your trial at ${invitation.club} was moved to ${formatTrialDate(invitation.scheduledDate)}.`,
      trialInvitationId: invitation.id,
      messageThreadId: invitation.messageThreadId,
    }),
  ];
}

export function buildInvitationCancelledNotifications(
  invitation: TrialInvitation,
): TrialNotification[] {
  return [
    buildTrialNotification({
      recipientId: invitation.playerId,
      recipientRole: 'player',
      title: 'Trial cancelled',
      body: `The trial at ${invitation.club} on ${formatTrialDate(invitation.scheduledDate)} was cancelled.`,
      trialInvitationId: invitation.id,
      messageThreadId: invitation.messageThreadId,
    }),
  ];
}

/** Placeholder for future real-time messaging channel attachment. */
export function resolveMessageThreadId(invitation: TrialInvitation): string {
  return invitation.messageThreadId ?? `thread-${invitation.id}`;
}

import { type TrialStatus } from '@/features/trial-invitations/types';

export const TRIAL_INVITATION_COLLECTION = 'trialInvitations';
export const TRIAL_NOTIFICATION_COLLECTION = 'trialNotifications';
export const TRIAL_INVITATIONS_STORAGE_KEY = '@scoutx/trial-invitations/v1';
export const TRIAL_NOTIFICATIONS_STORAGE_KEY = '@scoutx/trial-notifications/v1';

export const TRIAL_STATUS_META: Record<
  TrialStatus,
  { variant: 'default' | 'accent' | 'success' | 'warning' | 'error' | 'info' }
> = {
  pending: { variant: 'warning' },
  accepted: { variant: 'success' },
  declined: { variant: 'error' },
  rescheduled: { variant: 'info' },
  cancelled: { variant: 'default' },
  completed: { variant: 'accent' },
};

export const SCOUT_CANCELLABLE_STATUSES: TrialStatus[] = ['pending', 'accepted', 'rescheduled'];
export const SCOUT_RESCHEDULABLE_STATUSES: TrialStatus[] = ['pending', 'accepted', 'rescheduled'];
export const PLAYER_RESPONDABLE_STATUSES: TrialStatus[] = ['pending', 'rescheduled'];

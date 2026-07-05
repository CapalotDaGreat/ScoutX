import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  TRIAL_INVITATIONS_STORAGE_KEY,
  TRIAL_NOTIFICATIONS_STORAGE_KEY,
} from '@/features/trial-invitations/constants';
import { sortTrialInvitations, sortTrialNotifications } from '@/features/trial-invitations/models/TrialInvitationModel';
import { type TrialInvitation, type TrialNotification } from '@/features/trial-invitations/types';
import { loadScopedValue, saveScopedValue } from '@/data/scopedAsyncStorage';

type StoredInvitations = TrialInvitation[];

async function loadAllInvitations(): Promise<StoredInvitations> {
  try {
    const raw = await AsyncStorage.getItem(TRIAL_INVITATIONS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return JSON.parse(raw) as StoredInvitations;
  } catch {
    return [];
  }
}

async function saveAllInvitations(invitations: StoredInvitations): Promise<void> {
  await AsyncStorage.setItem(TRIAL_INVITATIONS_STORAGE_KEY, JSON.stringify(invitations));
}

export async function loadLocalTrialInvitationsForPlayer(
  playerId: string,
): Promise<TrialInvitation[]> {
  const parsed = await loadAllInvitations();
  return sortTrialInvitations(parsed.filter((item) => item.playerId === playerId));
}

export async function loadLocalTrialInvitationsForScoutPlayer(
  scoutId: string,
  playerId: string,
): Promise<TrialInvitation[]> {
  const parsed = await loadAllInvitations();
  return sortTrialInvitations(
    parsed.filter((item) => item.scoutId === scoutId && item.playerId === playerId),
  );
}

export async function saveLocalTrialInvitation(invitation: TrialInvitation): Promise<void> {
  const parsed = await loadAllInvitations();
  const next = sortTrialInvitations([
    invitation,
    ...parsed.filter((item) => item.id !== invitation.id),
  ]);
  await saveAllInvitations(next);
}

export async function loadLocalTrialNotifications(
  recipientId: string,
): Promise<TrialNotification[]> {
  return loadScopedValue(
    TRIAL_NOTIFICATIONS_STORAGE_KEY,
    recipientId,
    (value) => (Array.isArray(value) ? sortTrialNotifications(value as TrialNotification[]) : null),
    () => [],
  );
}

export async function saveLocalTrialNotification(notification: TrialNotification): Promise<void> {
  const current = await loadLocalTrialNotifications(notification.recipientId);
  const next = sortTrialNotifications([
    notification,
    ...current.filter((item) => item.id !== notification.id),
  ]);
  await saveScopedValue(TRIAL_NOTIFICATIONS_STORAGE_KEY, notification.recipientId, next);
}

export async function markLocalNotificationRead(
  recipientId: string,
  notificationId: string,
): Promise<void> {
  const current = await loadLocalTrialNotifications(recipientId);
  const next = current.map((item) =>
    item.id === notificationId ? { ...item, read: true } : item,
  );
  await saveScopedValue(TRIAL_NOTIFICATIONS_STORAGE_KEY, recipientId, next);
}

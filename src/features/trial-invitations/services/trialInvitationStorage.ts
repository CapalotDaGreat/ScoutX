import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  TRIAL_INVITATIONS_STORAGE_KEY,
  TRIAL_NOTIFICATIONS_STORAGE_KEY,
} from '@/features/trial-invitations/constants';
import { sortTrialInvitations, sortTrialNotifications } from '@/features/trial-invitations/models/TrialInvitationModel';
import { type TrialInvitation, type TrialNotification } from '@/features/trial-invitations/types';

type StoredInvitations = TrialInvitation[];
type StoredNotifications = Record<string, TrialNotification[]>;

export async function loadLocalTrialInvitationsForPlayer(
  playerId: string,
): Promise<TrialInvitation[]> {
  try {
    const raw = await AsyncStorage.getItem(TRIAL_INVITATIONS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as StoredInvitations;
    return sortTrialInvitations(parsed.filter((item) => item.playerId === playerId));
  } catch {
    return [];
  }
}

export async function loadLocalTrialInvitationsForScoutPlayer(
  scoutId: string,
  playerId: string,
): Promise<TrialInvitation[]> {
  try {
    const raw = await AsyncStorage.getItem(TRIAL_INVITATIONS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as StoredInvitations;
    return sortTrialInvitations(
      parsed.filter((item) => item.scoutId === scoutId && item.playerId === playerId),
    );
  } catch {
    return [];
  }
}

export async function saveLocalTrialInvitation(invitation: TrialInvitation): Promise<void> {
  const raw = await AsyncStorage.getItem(TRIAL_INVITATIONS_STORAGE_KEY);
  const parsed: StoredInvitations = raw ? (JSON.parse(raw) as StoredInvitations) : [];
  const next = sortTrialInvitations([
    invitation,
    ...parsed.filter((item) => item.id !== invitation.id),
  ]);
  await AsyncStorage.setItem(TRIAL_INVITATIONS_STORAGE_KEY, JSON.stringify(next));
}

export async function loadLocalTrialNotifications(
  recipientId: string,
): Promise<TrialNotification[]> {
  try {
    const raw = await AsyncStorage.getItem(TRIAL_NOTIFICATIONS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as StoredNotifications;
    return sortTrialNotifications(parsed[recipientId] ?? []);
  } catch {
    return [];
  }
}

export async function saveLocalTrialNotification(notification: TrialNotification): Promise<void> {
  const raw = await AsyncStorage.getItem(TRIAL_NOTIFICATIONS_STORAGE_KEY);
  const parsed: StoredNotifications = raw ? (JSON.parse(raw) as StoredNotifications) : {};
  const current = parsed[notification.recipientId] ?? [];
  parsed[notification.recipientId] = sortTrialNotifications([
    notification,
    ...current.filter((item) => item.id !== notification.id),
  ]);
  await AsyncStorage.setItem(TRIAL_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(parsed));
}

export async function markLocalNotificationRead(
  recipientId: string,
  notificationId: string,
): Promise<void> {
  const raw = await AsyncStorage.getItem(TRIAL_NOTIFICATIONS_STORAGE_KEY);
  if (!raw) {
    return;
  }
  const parsed = JSON.parse(raw) as StoredNotifications;
  parsed[recipientId] = (parsed[recipientId] ?? []).map((item) =>
    item.id === notificationId ? { ...item, read: true } : item,
  );
  await AsyncStorage.setItem(TRIAL_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(parsed));
}

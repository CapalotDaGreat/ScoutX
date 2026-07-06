import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = '@scoutx/notification-preferences/';

export type NotificationPreferences = {
  pushEnabled: boolean;
};

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export async function loadNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) {
      return { pushEnabled: true };
    }
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      pushEnabled: parsed.pushEnabled !== false,
    };
  } catch {
    return { pushEnabled: true };
  }
}

export async function saveNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences,
): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(preferences));
}

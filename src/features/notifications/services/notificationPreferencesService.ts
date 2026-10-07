import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import {
  defaultNotificationPreferences,
  parseNotificationPreferences,
  type NotificationPreferences,
} from '@/features/notifications/services/notificationPreferencesParser';

export {
  NOTIFICATION_CATEGORIES,
  defaultNotificationPreferences,
  parseNotificationPreferences,
  type LockScreenPreview,
  type NotificationCategory,
  type NotificationPreferences,
} from '@/features/notifications/services/notificationPreferencesParser';

const STORAGE_PREFIX = '@scoutx/notification-preferences/';
const COLLECTION = 'notificationPreferences';

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/** Server copy wins (it is what the push trigger enforces); device cache is the offline fallback. */
export async function loadNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const db = getFirestoreDb();
  if (db) {
    try {
      const snapshot = await getDoc(doc(db, COLLECTION, userId));
      if (snapshot.exists()) {
        return parseNotificationPreferences(snapshot.data());
      }
    } catch {
      // Offline or rules error: fall back to the device cache below.
    }
  }
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    return raw ? parseNotificationPreferences(JSON.parse(raw)) : defaultNotificationPreferences();
  } catch {
    return defaultNotificationPreferences();
  }
}

export async function saveNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences,
): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(preferences));
  const db = getFirestoreDb();
  if (!db) return;
  await setDoc(doc(db, COLLECTION, userId), {
    pushEnabled: preferences.pushEnabled,
    categories: preferences.categories,
    lockScreenPreview: preferences.lockScreenPreview,
    updatedAt: new Date().toISOString(),
  });
}

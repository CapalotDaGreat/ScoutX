import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = '@scoutx/notification-preferences/';

export const NOTIFICATION_CATEGORIES = [
  'trials',
  'watchlist',
  'analysis',
  'recommendations',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationPreferences = {
  pushEnabled: boolean;
  categories: Record<NotificationCategory, boolean>;
};

function defaultCategories(): Record<NotificationCategory, boolean> {
  return {
    trials: true,
    watchlist: true,
    analysis: true,
    recommendations: true,
  };
}

export function defaultNotificationPreferences(): NotificationPreferences {
  return { pushEnabled: true, categories: defaultCategories() };
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export async function loadNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) {
      return defaultNotificationPreferences();
    }
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences> & {
      categories?: Partial<Record<NotificationCategory, boolean>>;
    };
    const categories = defaultCategories();
    for (const key of NOTIFICATION_CATEGORIES) {
      if (typeof parsed.categories?.[key] === 'boolean') {
        categories[key] = parsed.categories[key];
      }
    }
    return {
      pushEnabled: parsed.pushEnabled !== false,
      categories,
    };
  } catch {
    return defaultNotificationPreferences();
  }
}

export async function saveNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences,
): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(preferences));
}

/** Must stay in sync with `functions/src/notificationPolicy.ts` and the Firestore rules. */
export const NOTIFICATION_CATEGORIES = [
  'match',
  'analysis',
  'development',
  'scouting',
  'trial',
  'career',
  'passport',
  'system',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** 'generic' hides who and what from the lock screen. Minors always get generic copy server-side. */
export type LockScreenPreview = 'details' | 'generic';

export type NotificationPreferences = {
  pushEnabled: boolean;
  categories: Record<NotificationCategory, boolean>;
  lockScreenPreview: LockScreenPreview;
};

const LEGACY_CATEGORY_KEYS: Record<string, NotificationCategory> = {
  trials: 'trial',
  watchlist: 'scouting',
  recommendations: 'passport',
};

export function defaultNotificationPreferences(): NotificationPreferences {
  const categories = {} as Record<NotificationCategory, boolean>;
  for (const key of NOTIFICATION_CATEGORIES) categories[key] = true;
  return { pushEnabled: true, categories, lockScreenPreview: 'details' };
}

function isCategory(key: string): key is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(key);
}

export function parseNotificationPreferences(value: unknown): NotificationPreferences {
  const result = defaultNotificationPreferences();
  if (!value || typeof value !== 'object') return result;
  const record = value as { pushEnabled?: unknown; categories?: unknown; lockScreenPreview?: unknown };
  result.pushEnabled = record.pushEnabled !== false;
  result.lockScreenPreview = record.lockScreenPreview === 'generic' ? 'generic' : 'details';
  if (record.categories && typeof record.categories === 'object') {
    for (const [key, enabled] of Object.entries(record.categories as Record<string, unknown>)) {
      if (typeof enabled !== 'boolean') continue;
      const mapped = isCategory(key) ? key : LEGACY_CATEGORY_KEYS[key];
      if (mapped) result.categories[mapped] = enabled;
    }
  }
  return result;
}

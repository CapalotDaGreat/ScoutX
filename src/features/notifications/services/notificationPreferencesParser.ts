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

/**
 * Quiet hours: no push between start and end (minutes after local midnight, at the UTC offset the
 * device had when the setting was saved). The activity still appears in the in-app feed.
 */
export type QuietHours = { enabled: boolean; startMinute: number; endMinute: number; utcOffsetMinutes: number };

export type NotificationPreferences = {
  pushEnabled: boolean;
  categories: Record<NotificationCategory, boolean>;
  lockScreenPreview: LockScreenPreview;
  quietHours?: QuietHours | null;
};

export const DEFAULT_QUIET_HOURS = { startMinute: 22 * 60, endMinute: 7 * 60 } as const;

export function parseQuietHours(value: unknown): QuietHours | null {
  if (!value || typeof value !== 'object') return null;
  const q = value as Record<string, unknown>;
  const minute = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1440;
  if (typeof q.enabled !== 'boolean' || !minute(q.startMinute) || !minute(q.endMinute)
    || typeof q.utcOffsetMinutes !== 'number' || !Number.isInteger(q.utcOffsetMinutes) || Math.abs(q.utcOffsetMinutes) > 840) return null;
  return { enabled: q.enabled, startMinute: q.startMinute as number, endMinute: q.endMinute as number, utcOffsetMinutes: q.utcOffsetMinutes };
}

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
  const record = value as { pushEnabled?: unknown; categories?: unknown; lockScreenPreview?: unknown; quietHours?: unknown };
  result.quietHours = parseQuietHours(record.quietHours);
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

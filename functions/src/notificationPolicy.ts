/**
 * Server-side push policy. Kept dependency-free so the unit suite can import it directly.
 * The category list must stay in sync with the client `NOTIFICATION_CATEGORIES`.
 */
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

export type StoredNotificationPreferences = {
  pushEnabled: boolean;
  categories: Record<NotificationCategory, boolean>;
};

/** Activity types that can produce a push, and the user-facing category each belongs to. */
export const ACTIVITY_CATEGORY: Record<string, NotificationCategory> = {
  portfolio_viewed: 'passport',
  recommendation_received: 'passport',
  trial_invitation: 'trial',
  milestone_earned: 'career',
  weekly_report_ready: 'development',
  analysis_completed: 'analysis',
  evidence_requested: 'scouting',
  watchlist_change: 'scouting',
};

/** Pre-Phase-AE category keys, mapped to their replacements. */
const LEGACY_CATEGORY_KEYS: Record<string, NotificationCategory> = {
  trials: 'trial',
  watchlist: 'scouting',
  recommendations: 'passport',
};

/** Hard cap across all categories, independent of per-type cooldowns. */
export const MAX_PUSHES_PER_HOUR = 6;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function defaultStoredPreferences(): StoredNotificationPreferences {
  const categories = {} as Record<NotificationCategory, boolean>;
  for (const key of NOTIFICATION_CATEGORIES) categories[key] = true;
  return { pushEnabled: true, categories };
}

export function parseStoredPreferences(value: unknown): StoredNotificationPreferences {
  const result = defaultStoredPreferences();
  const record = asRecord(value);
  if (!record) return result;
  result.pushEnabled = record.pushEnabled !== false;
  const categories = asRecord(record.categories) ?? {};
  for (const [key, enabled] of Object.entries(categories)) {
    if (typeof enabled !== 'boolean') continue;
    const mapped = (NOTIFICATION_CATEGORIES as readonly string[]).includes(key)
      ? (key as NotificationCategory)
      : LEGACY_CATEGORY_KEYS[key];
    if (mapped) result.categories[mapped] = enabled;
  }
  return result;
}

export type PushDecision =
  | { send: true; category: NotificationCategory }
  | {
      send: false;
      reason: 'unknown_type' | 'push_disabled' | 'category_disabled' | 'hourly_cap' | 'cooldown';
    };

export function decidePush(
  activityType: string,
  preferences: StoredNotificationPreferences,
  recentSendTimes: readonly number[],
  now: number,
): PushDecision {
  const category = ACTIVITY_CATEGORY[activityType];
  if (!category) return { send: false, reason: 'unknown_type' };
  if (!preferences.pushEnabled) return { send: false, reason: 'push_disabled' };
  if (!preferences.categories[category]) return { send: false, reason: 'category_disabled' };
  const lastHour = recentSendTimes.filter((time) => now - time < 60 * 60 * 1000);
  if (lastHour.length >= MAX_PUSHES_PER_HOUR) return { send: false, reason: 'hourly_cap' };
  return { send: true, category };
}

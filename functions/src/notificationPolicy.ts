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
  analysis_failed: 'analysis',
  evidence_requested: 'scouting',
  evidence_fulfilled: 'scouting',
  watchlist_change: 'scouting',
  trial_update: 'trial',
  passport_improved: 'passport',
  development_reminder: 'development',
};

/** Deep-link path (no scheme) opened when a push is tapped. Unknown types open Home. */
export function pushPathFor(
  type: string,
  reference: { entityType?: string; entityId?: string } | null | undefined,
  recipientRole: string | undefined,
): string {
  const id = typeof reference?.entityId === 'string' ? reference.entityId : '';
  const scout = recipientRole === 'scout' || recipientRole === 'coach';
  switch (type) {
    case 'analysis_completed':
    case 'analysis_failed':
      return id ? `match/${id}` : 'player/home';
    case 'trial_invitation':
    case 'trial_update':
      return id ? `trial/${id}` : scout ? 'scout/trials' : 'player/trials';
    case 'evidence_requested':
      return id ? `request/${id}` : 'player/requests';
    case 'evidence_fulfilled':
      return id ? `scout/player/${id}` : 'scout';
    case 'watchlist_change':
      return 'scout';
    case 'weekly_report_ready':
    case 'development_reminder':
      return 'player/performance';
    default:
      return scout ? 'scout' : 'player/home';
  }
}

/** Number of evidence-coverage dimensions at moderate or strong. */
export function solidCoverageCount(coverage: unknown): number {
  if (!Array.isArray(coverage)) return 0;
  return coverage.filter((item) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    return row?.state === 'moderate' || row?.state === 'strong';
  }).length;
}

/** A Passport change is only worth a push when a coverage dimension became solid. */
export function isMeaningfulPassportImprovement(before: unknown, after: unknown): boolean {
  return solidCoverageCount(after) > solidCoverageCount(before);
}

export type TrialParty = 'player' | 'scout';

/** Who should hear about a trial status change: the side that did not make it. */
export function trialUpdateRecipient(fromStatus: unknown, toStatus: unknown): TrialParty | null {
  if (fromStatus === toStatus || typeof toStatus !== 'string') return null;
  if (toStatus === 'accepted' || toStatus === 'declined') return 'scout';
  if (toStatus === 'rescheduled' || toStatus === 'cancelled' || toStatus === 'completed') {
    return 'player';
  }
  return null;
}

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

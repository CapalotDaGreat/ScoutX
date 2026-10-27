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

export type LockScreenPreview = 'details' | 'generic';

export type StoredNotificationPreferences = {
  pushEnabled: boolean;
  categories: Record<NotificationCategory, boolean>;
  lockScreenPreview: LockScreenPreview;
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
  analysis_first_moments: 'analysis',
  analysis_review_needed: 'analysis',
  analysis_interrupted: 'analysis',
  analysis_action_required: 'analysis',
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
    case 'analysis_interrupted':
    case 'analysis_action_required':
      return id ? `match/${id}` : 'player/home';
    case 'analysis_first_moments':
      return id ? `match/${id}/moments` : 'player/home';
    case 'analysis_review_needed':
      return id ? `match/${id}/review` : 'player/home';
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

const MATCH_MILESTONES = [1, 3, 5, 10, 20, 40];
const VIDEO_MILESTONES = [1, 3, 5, 10];

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function crossedMilestone(before: number, after: number, milestones: readonly number[]): boolean {
  return milestones.some((milestone) => before < milestone && after >= milestone);
}

type SummaryLike = { coverage?: unknown; matchCount?: unknown; videoCount?: unknown } | null | undefined;

/**
 * A Passport change is only worth a push when a coverage dimension became solid, or the
 * recorded match/video count crossed a milestone. Single edits never push.
 */
export function isMeaningfulPassportImprovement(before: SummaryLike, after: SummaryLike): boolean {
  if (solidCoverageCount(after?.coverage) > solidCoverageCount(before?.coverage)) return true;
  return (
    crossedMilestone(asCount(before?.matchCount), asCount(after?.matchCount), MATCH_MILESTONES) ||
    crossedMilestone(asCount(before?.videoCount), asCount(after?.videoCount), VIDEO_MILESTONES)
  );
}

export type WatchlistChange = 'match' | 'video';

/** What a watched player added, from the public summary counts. */
export function summaryChanges(before: SummaryLike, after: SummaryLike): WatchlistChange[] {
  const changes: WatchlistChange[] = [];
  if (asCount(after?.matchCount) > asCount(before?.matchCount)) changes.push('match');
  if (asCount(after?.videoCount) > asCount(before?.videoCount)) changes.push('video');
  return changes;
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
  return { pushEnabled: true, categories, lockScreenPreview: 'details' };
}

export function parseStoredPreferences(value: unknown): StoredNotificationPreferences {
  const result = defaultStoredPreferences();
  const record = asRecord(value);
  if (!record) return result;
  result.pushEnabled = record.pushEnabled !== false;
  result.lockScreenPreview = record.lockScreenPreview === 'generic' ? 'generic' : 'details';
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

export const GENERIC_PUSH_COPY = {
  title: 'PitchProof',
  body: 'You have a new update. Open PitchProof to see it.',
} as const;

/** Minors always get generic lock-screen copy; adults choose. */
export function lockScreenCopy(
  copy: { title: string; body: string },
  preview: LockScreenPreview,
  isMinor: boolean,
): { title: string; body: string } {
  return isMinor || preview === 'generic' ? { ...GENERIC_PUSH_COPY } : copy;
}
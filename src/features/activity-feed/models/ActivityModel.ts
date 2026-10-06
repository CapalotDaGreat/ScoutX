import {
  ACTIVITY_CATEGORY_LABELS,
  ACTIVITY_TYPE_LABELS,
} from '@/features/activity-feed/constants';
import {
  type ActivityCategory,
  type ActivityDraft,
  type ActivityGroup,
  type ActivityItem,
  type ActivityReference,
  type ActivityReferenceEntity,
  type ActivityTimelineSection,
  type ActivityType,
} from '@/features/activity-feed/types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseReference(value: unknown): ActivityReference | undefined {
  const record = asRecord(value);
  if (!record || typeof record.entityType !== 'string' || typeof record.entityId !== 'string') {
    return undefined;
  }

  const entityTypes: ActivityReferenceEntity[] = [
    'player',
    'scout',
    'trial',
    'report',
    'video',
    'recommendation',
    'recruitment',
    'evidence_request',
  ];

  if (!entityTypes.includes(record.entityType as ActivityReferenceEntity)) {
    return undefined;
  }

  return {
    entityType: record.entityType as ActivityReferenceEntity,
    entityId: record.entityId,
    label: typeof record.label === 'string' ? record.label : undefined,
  };
}

const activityTypes: ActivityType[] = [
  'profile_updated',
  'trial_invitation',
  'scouting_report_created',
  'video_uploaded',
  'player_saved',
  'recommendation_received',
  'portfolio_viewed',
  'milestone_earned',
  'weekly_report_ready',
  'evidence_requested',
];

const activityCategories: ActivityCategory[] = [
  'profile',
  'trial',
  'scouting',
  'media',
  'recruitment',
  'trust',
  'system',
];

function isActivityType(value: string): value is ActivityType {
  return activityTypes.includes(value as ActivityType);
}

function isActivityCategory(value: string): value is ActivityCategory {
  return activityCategories.includes(value as ActivityCategory);
}

export function createActivityId(): string {
  return `activity-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function buildActivityFromDraft(draft: ActivityDraft): ActivityItem {
  const now = new Date().toISOString();
  return {
    id: draft.id ?? createActivityId(),
    recipientId: draft.recipientId,
    recipientRole: draft.recipientRole,
    type: draft.type,
    category: draft.category,
    title: draft.title,
    body: draft.body,
    actorId: draft.actorId,
    actorName: draft.actorName,
    actorRole: draft.actorRole,
    reference: draft.reference,
    read: draft.read ?? false,
    createdAt: draft.createdAt ?? now,
    pushMessageId: draft.pushMessageId ?? null,
  };
}

export function parseActivity(value: unknown, id: string): ActivityItem | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const type = typeof record.type === 'string' && isActivityType(record.type) ? record.type : null;
  const category =
    typeof record.category === 'string' && isActivityCategory(record.category)
      ? record.category
      : null;

  if (
    !type ||
    !category ||
    typeof record.recipientId !== 'string' ||
    typeof record.title !== 'string' ||
    typeof record.body !== 'string' ||
    typeof record.actorId !== 'string' ||
    typeof record.actorName !== 'string'
  ) {
    return null;
  }

  const recipientRole =
    record.recipientRole === 'scout' || record.recipientRole === 'player'
      ? record.recipientRole
      : 'player';
  const actorRole =
    record.actorRole === 'scout' || record.actorRole === 'player' || record.actorRole === 'system'
      ? record.actorRole
      : 'system';

  return {
    id,
    recipientId: record.recipientId,
    recipientRole,
    type,
    category,
    title: record.title,
    body: record.body,
    actorId: record.actorId,
    actorName: record.actorName,
    actorRole,
    reference: parseReference(record.reference),
    read: record.read === true,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
    pushMessageId: typeof record.pushMessageId === 'string' ? record.pushMessageId : null,
  };
}

export function serializeActivity(activity: ActivityItem): Record<string, unknown> {
  return {
    recipientId: activity.recipientId,
    recipientRole: activity.recipientRole,
    type: activity.type,
    category: activity.category,
    title: activity.title,
    body: activity.body,
    actorId: activity.actorId,
    actorName: activity.actorName,
    actorRole: activity.actorRole,
    reference: activity.reference ?? null,
    read: activity.read,
    createdAt: activity.createdAt,
    pushMessageId: activity.pushMessageId ?? null,
  };
}

export function sortActivities(activities: ActivityItem[]): ActivityItem[] {
  return [...activities].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export function countUnreadActivities(activities: ActivityItem[]): number {
  return activities.filter((item) => !item.read).length;
}

function startOfDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatActivityDateLabel(isoDate: string): string {
  const date = new Date(isoDate);
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (target === today) {
    return 'Today';
  }
  if (target === startOfDay(yesterday)) {
    return 'Yesterday';
  }

  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export function formatActivityTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return 'Just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function groupActivitiesByCategory(activities: ActivityItem[]): ActivityGroup[] {
  const grouped = new Map<ActivityCategory, ActivityItem[]>();

  for (const activity of sortActivities(activities)) {
    const current = grouped.get(activity.category) ?? [];
    current.push(activity);
    grouped.set(activity.category, current);
  }

  return Array.from(grouped.entries()).map(([key, items]) => ({
    key,
    label: ACTIVITY_CATEGORY_LABELS[key],
    items,
  }));
}

export function buildActivityTimeline(activities: ActivityItem[]): ActivityTimelineSection[] {
  const byDate = new Map<string, ActivityItem[]>();

  for (const activity of sortActivities(activities)) {
    const dateKey = startOfDay(new Date(activity.createdAt));
    const current = byDate.get(dateKey) ?? [];
    current.push(activity);
    byDate.set(dateKey, current);
  }

  return Array.from(byDate.entries()).map(([dateKey, items]) => ({
    dateKey,
    dateLabel: formatActivityDateLabel(items[0]?.createdAt ?? dateKey),
    groups: groupActivitiesByCategory(items),
  }));
}

export function getActivityTypeLabel(type: ActivityType): string {
  return ACTIVITY_TYPE_LABELS[type];
}

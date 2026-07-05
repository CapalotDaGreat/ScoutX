import { loadScopedValue, saveScopedValue } from '@/data/scopedAsyncStorage';
import { ACTIVITY_STORAGE_KEY } from '@/features/activity-feed/constants';
import { parseActivity, sortActivities } from '@/features/activity-feed/models/ActivityModel';
import { type ActivityItem } from '@/features/activity-feed/types';

export async function loadLocalActivities(recipientId: string): Promise<ActivityItem[]> {
  return loadScopedValue(
    ACTIVITY_STORAGE_KEY,
    recipientId,
    (value) => {
      if (!Array.isArray(value)) {
        return null;
      }
      return sortActivities(
        value
          .map((item) => parseActivity(item, typeof item?.id === 'string' ? item.id : ''))
          .filter((item): item is ActivityItem => item !== null),
      );
    },
    () => [],
  );
}

export async function saveLocalActivities(
  recipientId: string,
  activities: ActivityItem[],
): Promise<void> {
  await saveScopedValue(ACTIVITY_STORAGE_KEY, recipientId, sortActivities(activities));
}

export async function upsertLocalActivity(activity: ActivityItem): Promise<void> {
  const current = await loadLocalActivities(activity.recipientId);
  const next = sortActivities([
    activity,
    ...current.filter((item) => item.id !== activity.id),
  ]);
  await saveLocalActivities(activity.recipientId, next);
}

export async function markLocalActivityRead(
  recipientId: string,
  activityId: string,
): Promise<void> {
  const current = await loadLocalActivities(recipientId);
  const next = current.map((item) =>
    item.id === activityId ? { ...item, read: true } : item,
  );
  await saveLocalActivities(recipientId, next);
}

export async function markAllLocalActivitiesRead(recipientId: string): Promise<void> {
  const current = await loadLocalActivities(recipientId);
  const next = current.map((item) => ({ ...item, read: true }));
  await saveLocalActivities(recipientId, next);
}

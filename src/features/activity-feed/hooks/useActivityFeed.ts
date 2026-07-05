import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityRepository } from '@/features/activity-feed/repositories/ActivityRepository';
import {
  buildActivityTimeline,
  countUnreadActivities,
  groupActivitiesByCategory,
  sortActivities,
} from '@/features/activity-feed/models/ActivityModel';
import { type ActivityItem } from '@/features/activity-feed/types';

export type UseActivityFeedOptions = {
  recipientId: string | null;
  recipientRole: 'player' | 'scout';
  recentLimit?: number;
};

export function useActivityFeed({
  recipientId,
  recipientRole,
  recentLimit = 5,
}: UseActivityFeedOptions) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const repository = useMemo(() => ActivityRepository.getInstance(), []);

  useEffect(() => {
    if (!recipientId) {
      setActivities([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = repository.subscribeToActivities(
      recipientId,
      recipientRole,
      (nextActivities) => {
        setActivities(nextActivities);
        setIsLoading(false);
      },
      (err) => {
        setError(err.message);
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, [recipientId, recipientRole, repository]);

  const unreadCount = useMemo(() => countUnreadActivities(activities), [activities]);
  const recentActivities = useMemo(
    () => sortActivities(activities).slice(0, recentLimit),
    [activities, recentLimit],
  );
  const groupedNotifications = useMemo(
    () => groupActivitiesByCategory(activities),
    [activities],
  );
  const timeline = useMemo(() => buildActivityTimeline(activities), [activities]);

  const markRead = useCallback(
    async (activityId: string) => {
      if (!recipientId) {
        return;
      }
      await repository.markActivityRead(recipientId, activityId);
      setActivities((current) =>
        current.map((item) => (item.id === activityId ? { ...item, read: true } : item)),
      );
    },
    [recipientId, repository],
  );

  const markAllRead = useCallback(async () => {
    if (!recipientId) {
      return;
    }
    await repository.markAllActivitiesRead(recipientId);
    setActivities((current) => current.map((item) => ({ ...item, read: true })));
  }, [recipientId, repository]);

  return {
    activities,
    recentActivities,
    groupedNotifications,
    timeline,
    unreadCount,
    isLoading,
    error,
    markRead,
    markAllRead,
  };
}

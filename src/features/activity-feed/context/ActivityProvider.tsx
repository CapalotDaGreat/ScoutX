import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useActivityFeed } from '@/features/activity-feed/hooks/useActivityFeed';
import { mapPushPayloadToActivityDraft } from '@/features/activity-feed/services/pushActivityAdapter';
import { ActivityRepository } from '@/features/activity-feed/repositories/ActivityRepository';
import {
  noopPushNotificationPort,
  type PushNotificationPort,
} from '@/features/activity-feed/services/pushNotificationPort';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { type ActivityItem } from '@/features/activity-feed/types';
import { type ActivityGroup } from '@/features/activity-feed/types';
import { type ActivityTimelineSection } from '@/features/activity-feed/types';

type ActivityContextValue = {
  activities: ActivityItem[];
  recentActivities: ActivityItem[];
  groupedNotifications: ActivityGroup[];
  timeline: ActivityTimelineSection[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  markRead: (activityId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const ActivityContext = createContext<ActivityContextValue | null>(null);

export type ActivityProviderProps = {
  children: ReactNode;
  pushPort?: PushNotificationPort;
};

export function ActivityProvider({ children, pushPort = noopPushNotificationPort }: ActivityProviderProps) {
  const { user } = useAuth();
  const recipientRole = user?.role === 'scout' ? 'scout' : 'player';
  const recipientId = user?.uid ?? null;
  const feed = useActivityFeed({
    recipientId,
    recipientRole,
  });

  useEffect(() => {
    if (!recipientId) {
      return;
    }

    void pushPort.registerDevice(recipientId);

    const unsubscribe = pushPort.subscribe((payload) => {
      const draft = mapPushPayloadToActivityDraft(payload, recipientId);
      if (!draft) {
        return;
      }
      void ActivityRepository.getInstance().recordActivity(draft);
    });

    return () => {
      unsubscribe();
      void pushPort.unregisterDevice(recipientId);
    };
  }, [pushPort, recipientId]);

  const value = useMemo<ActivityContextValue>(
    () => ({
      activities: feed.activities,
      recentActivities: feed.recentActivities,
      groupedNotifications: feed.groupedNotifications,
      timeline: feed.timeline,
      unreadCount: feed.unreadCount,
      isLoading: feed.isLoading,
      error: feed.error,
      markRead: feed.markRead,
      markAllRead: feed.markAllRead,
    }),
    [feed],
  );

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function useActivities(): ActivityContextValue {
  const context = useContext(ActivityContext);
  if (!context) {
    throw new Error('useActivities must be used within ActivityProvider');
  }
  return context;
}

export function useOptionalActivities(): ActivityContextValue | null {
  return useContext(ActivityContext);
}

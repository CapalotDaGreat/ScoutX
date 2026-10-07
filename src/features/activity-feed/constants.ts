import { type ActivityCategory } from '@/features/activity-feed/types';
import { type NotificationType } from '@/components/primitives/NotificationCard';

export const ACTIVITY_COLLECTION = 'activities';
export const ACTIVITY_STORAGE_KEY = '@scoutx/activity-feed';

export const ACTIVITY_CATEGORY_NOTIFICATION_TYPE: Record<ActivityCategory, NotificationType> = {
  profile: 'profile',
  trial: 'trial',
  scouting: 'ai',
  media: 'achievement',
  recruitment: 'system',
  trust: 'profile',
  system: 'system',
};

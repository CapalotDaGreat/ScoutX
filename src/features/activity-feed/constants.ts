import {
  type ActivityCategory,
  type ActivityType,
} from '@/features/activity-feed/types';
import { type NotificationType } from '@/components/primitives/NotificationCard';

export const ACTIVITY_COLLECTION = 'activities';
export const ACTIVITY_STORAGE_KEY = '@scoutx/activity-feed';

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  profile_updated: 'Profile Updated',
  trial_invitation: 'Trial Invitation',
  scouting_report_created: 'New Scouting Report',
  video_uploaded: 'Video Uploaded',
  player_saved: 'Player Saved',
  recommendation_received: 'Recommendation Received',
};

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  profile: 'Profile',
  trial: 'Trials',
  scouting: 'Scouting',
  media: 'Media',
  recruitment: 'Recruitment',
  trust: 'Trust',
  system: 'System',
};

export const ACTIVITY_CATEGORY_NOTIFICATION_TYPE: Record<ActivityCategory, NotificationType> = {
  profile: 'profile',
  trial: 'trial',
  scouting: 'ai',
  media: 'achievement',
  recruitment: 'system',
  trust: 'profile',
  system: 'system',
};

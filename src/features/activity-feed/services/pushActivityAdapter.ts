import { type PushNotificationPayload } from '@/features/activity-feed/services/pushNotificationPort';
import {
  type ActivityCategory,
  type ActivityDraft,
  type ActivityReferenceEntity,
  type ActivityType,
} from '@/features/activity-feed/types';

const activityTypes: ActivityType[] = [
  'profile_updated',
  'trial_invitation',
  'scouting_report_created',
  'video_uploaded',
  'player_saved',
  'recommendation_received',
  'portfolio_viewed',
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

const referenceEntities: ActivityReferenceEntity[] = [
  'player',
  'scout',
  'trial',
  'report',
  'video',
  'recommendation',
  'recruitment',
];

function isActivityType(value: string | undefined): value is ActivityType {
  return Boolean(value && activityTypes.includes(value as ActivityType));
}

function isActivityCategory(value: string | undefined): value is ActivityCategory {
  return Boolean(value && activityCategories.includes(value as ActivityCategory));
}

function isReferenceEntity(value: string | undefined): value is ActivityReferenceEntity {
  return Boolean(value && referenceEntities.includes(value as ActivityReferenceEntity));
}

/**
 * Maps a remote push payload into an activity draft.
 * Keeps FCM-specific parsing isolated from UI and repositories.
 */
export function mapPushPayloadToActivityDraft(
  payload: PushNotificationPayload,
  recipientId: string,
): ActivityDraft | null {
  const data = payload.data ?? {};
  const type = data.activityType;

  if (!isActivityType(type)) {
    return null;
  }

  const actorRole =
    data.actorRole === 'scout' ? 'scout' : data.actorRole === 'system' ? 'system' : 'player';
  const recipientRole = data.recipientRole === 'scout' ? 'scout' : 'player';

  return {
    recipientId,
    recipientRole,
    type,
    category: isActivityCategory(data.activityCategory) ? data.activityCategory : 'system',
    title: payload.title,
    body: payload.body,
    actorId: data.actorId ?? 'system',
    actorName: data.actorName ?? 'PitchProof',
    actorRole,
    reference:
      data.entityId && isReferenceEntity(data.entityType)
        ? {
            entityType: data.entityType,
            entityId: data.entityId,
            label: data.entityLabel,
          }
        : undefined,
    pushMessageId: payload.messageId ?? null,
  };
}

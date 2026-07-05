export type ActivityCategory =
  | 'profile'
  | 'trial'
  | 'scouting'
  | 'media'
  | 'recruitment'
  | 'trust'
  | 'system';

export type ActivityType =
  | 'profile_updated'
  | 'trial_invitation'
  | 'scouting_report_created'
  | 'video_uploaded'
  | 'player_saved'
  | 'recommendation_received'
  | 'portfolio_viewed'
  | 'milestone_earned'
  | 'weekly_report_ready';

export type ActivityActorRole = 'player' | 'scout' | 'system';

export type ActivityReferenceEntity =
  | 'player'
  | 'scout'
  | 'trial'
  | 'report'
  | 'video'
  | 'recommendation'
  | 'recruitment';

export type ActivityReference = {
  entityType: ActivityReferenceEntity;
  entityId: string;
  label?: string;
};

export type ActivityItem = {
  id: string;
  recipientId: string;
  recipientRole: ActivityActorRole;
  type: ActivityType;
  category: ActivityCategory;
  title: string;
  body: string;
  actorId: string;
  actorName: string;
  actorRole: ActivityActorRole;
  reference?: ActivityReference;
  read: boolean;
  createdAt: string;
  /** Reserved for Firebase Cloud Messaging deduplication. */
  pushMessageId?: string | null;
};

export type ActivityDraft = Omit<ActivityItem, 'id' | 'createdAt' | 'read'> & {
  id?: string;
  createdAt?: string;
  read?: boolean;
};

export type ActivityGroup = {
  key: ActivityCategory;
  label: string;
  items: ActivityItem[];
};

export type ActivityTimelineSection = {
  dateKey: string;
  dateLabel: string;
  groups: ActivityGroup[];
};

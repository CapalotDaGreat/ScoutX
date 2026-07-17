import { View } from 'react-native';
import { PreviewList } from '@/components/layout/PreviewList';
import { Text } from '@/components/primitives/Text';
import { NotificationCard } from '@/components/primitives/NotificationCard';
import { ACTIVITY_CATEGORY_NOTIFICATION_TYPE } from '@/features/activity-feed/constants';
import { formatActivityTimestamp } from '@/features/activity-feed/models/ActivityModel';
import { type ActivityItem } from '@/features/activity-feed/types';

export type ActivityCardProps = {
  activity: ActivityItem;
  onPress?: (activity: ActivityItem) => void;
};

export function ActivityCard({ activity, onPress }: ActivityCardProps) {
  return (
    <NotificationCard
      title={activity.title}
      body={activity.body}
      timestamp={formatActivityTimestamp(activity.createdAt)}
      type={ACTIVITY_CATEGORY_NOTIFICATION_TYPE[activity.category]}
      read={activity.read}
      avatarName={activity.actorName}
      onPress={onPress ? () => onPress(activity) : undefined}
    />
  );
}

export type ActivityGroupSectionProps = {
  title: string;
  activities: ActivityItem[];
  onActivityPress?: (activity: ActivityItem) => void;
  previewCount?: number;
};

export function ActivityGroupSection({
  title,
  activities,
  onActivityPress,
  previewCount = 3,
}: ActivityGroupSectionProps) {
  if (activities.length === 0) {
    return null;
  }

  return (
    <View className="gap-3">
      <Text variant="overline" color="secondary">
        {title}
      </Text>
      <PreviewList
        items={activities}
        previewCount={previewCount}
        keyExtractor={(activity) => activity.id}
        renderItem={(activity) => (
          <ActivityCard activity={activity} onPress={onActivityPress} />
        )}
      />
    </View>
  );
}

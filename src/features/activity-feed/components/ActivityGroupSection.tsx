import { View } from 'react-native';
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
};

export function ActivityGroupSection({
  title,
  activities,
  onActivityPress,
}: ActivityGroupSectionProps) {
  if (activities.length === 0) {
    return null;
  }

  return (
    <View className="gap-3">
      <Text variant="overline" color="secondary">
        {title}
      </Text>
      {activities.map((activity) => (
        <ActivityCard key={activity.id} activity={activity} onPress={onActivityPress} />
      ))}
    </View>
  );
}

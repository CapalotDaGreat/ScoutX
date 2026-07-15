import { View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { ActivityCard } from '@/features/activity-feed/components/ActivityGroupSection';
import { useActivities } from '@/features/activity-feed/context/ActivityProvider';
import { type ActivityItem } from '@/features/activity-feed/types';
import { useTheme } from '@/theme';

export type ActivityUnreadBadgeProps = {
  count: number;
};

export function ActivityUnreadBadge({ count }: ActivityUnreadBadgeProps) {
  if (count <= 0) {
    return null;
  }

  const label = count > 9 ? '9+' : String(count);

  return (
    <View className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-accent px-1 py-0.5">
      <Text variant="caption" className="text-center font-sans-bold text-white">
        {label}
      </Text>
    </View>
  );
}

export type ActivityBellButtonProps = {
  unreadCount: number;
  onPress: () => void;
};

export function ActivityBellButton({ unreadCount, onPress }: ActivityBellButtonProps) {
  const { colors } = useTheme();

  return (
    <View className="relative">
      <Button
        variant="ghost"
        size="sm"
        accessibilityLabel={`Activity inbox${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        onPress={onPress}
        leftIcon={<Bell size={18} color={colors.textPrimary} />}
      >
        Activity
      </Button>
      <ActivityUnreadBadge count={unreadCount} />
    </View>
  );
}

export type ActivityFeedSectionProps = {
  onViewAllPress?: () => void;
  onActivityPress?: (activity: ActivityItem) => void;
  limit?: number;
};

export function ActivityFeedSection({
  onViewAllPress,
  onActivityPress,
  limit = 5,
}: ActivityFeedSectionProps) {
  const { recentActivities, unreadCount, isLoading, markRead } = useActivities();
  const items = recentActivities.slice(0, limit);

  const handlePress = (activity: ActivityItem) => {
    if (!activity.read) {
      void markRead(activity.id);
    }
    onActivityPress?.(activity);
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between gap-3">
        <View>
          <Text weight="semibold">Recent Activity</Text>
          <Text variant="caption" color="secondary">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'All caught up'}
          </Text>
        </View>
        {onViewAllPress ? (
          <Button variant="ghost" size="sm" onPress={onViewAllPress}>
            View all
          </Button>
        ) : null}
      </View>

      {isLoading ? (
        <SkeletonLoader variant="card" count={2} />
      ) : items.length === 0 ? (
        <View className="rounded-xl border border-dashed border-border px-4 py-8">
          <Text variant="body-sm" color="secondary" className="text-center">
            Important actions will appear here as activity updates.
          </Text>
        </View>
      ) : (
        <View className="gap-3">
          {items.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} onPress={handlePress} />
          ))}
        </View>
      )}
    </View>
  );
}

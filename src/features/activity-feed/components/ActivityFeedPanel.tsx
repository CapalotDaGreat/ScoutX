import { Pressable, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { ActivityCard } from '@/features/activity-feed/components/ActivityGroupSection';
import { useActivities } from '@/features/activity-feed/context/ActivityProvider';
import { type ActivityItem } from '@/features/activity-feed/types';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { triggerHaptic } from '@/utils/haptics';

export type ActivityUnreadBadgeProps = {
  count: number;
};

/**
 * Unread count pill. Parent hit-box must leave room on the trailing edge
 * so the badge never clips against the screen (no negative overflow).
 */
export function ActivityUnreadBadge({ count }: ActivityUnreadBadgeProps) {
  if (count <= 0) {
    return null;
  }

  const label = count > 99 ? '99+' : count > 9 ? '9+' : String(count);
  const wide = label.length > 1;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      className={cn(
        'absolute right-0 top-0 z-10 items-center justify-center rounded-full bg-accent',
        wide ? 'min-w-[22px] px-1.5 py-0.5' : 'h-[18px] w-[18px]',
      )}
    >
      <Text
        variant="caption"
        color="onAccent"
        weight="bold"
        className="text-center text-[10px] leading-[12px]"
      >
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
    <View className="relative h-11 w-11 items-center justify-center overflow-visible">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Activity inbox${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        hitSlop={6}
        onPress={() => {
          void triggerHaptic('light');
          onPress();
        }}
        className="h-11 w-11 items-center justify-center rounded-full border border-border bg-surface"
        style={({ pressed }) =>
          pressed ? { opacity: 0.75, transform: [{ scale: 0.96 }] } : undefined
        }
      >
        <Bell size={20} color={colors.textPrimary} strokeWidth={2} />
      </Pressable>
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
        <View className="min-w-0 flex-1">
          <Text weight="semibold">Recent Activity</Text>
          <Text variant="caption" color="secondary" className="mt-0.5">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
              : 'All caught up'}
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
        <View className="rounded-2xl border border-dashed border-border bg-surface/60 px-5 py-10">
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

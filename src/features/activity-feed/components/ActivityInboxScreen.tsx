import { View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { ActivityGroupSection } from '@/features/activity-feed/components/ActivityGroupSection';
import { ActivityTimeline } from '@/features/activity-feed/components/ActivityTimeline';
import { useActivities } from '@/features/activity-feed/context/ActivityProvider';
import { type ActivityItem } from '@/features/activity-feed/types';

export type ActivityInboxScreenProps = {
  onBack?: () => void;
  embeddedInTabShell?: boolean;
};

export function ActivityInboxScreen({ onBack, embeddedInTabShell = false }: ActivityInboxScreenProps) {
  const {
    groupedNotifications,
    timeline,
    unreadCount,
    isLoading,
    error,
    markRead,
    markAllRead,
  } = useActivities();

  const screenProps = embeddedInTabShell ? { embeddedInTabShell: true as const } : {};

  const handleActivityPress = (activity: ActivityItem) => {
    if (!activity.read) {
      void markRead(activity.id);
    }
  };

  return (
    <Screen
      title="Activity"
      subtitle="Recent updates, grouped notifications, and your timeline."
      safeArea
      {...screenProps}
      header={
        <View className="mb-4 flex-row items-center justify-between gap-3">
          <View className="flex-1">
            {onBack ? (
              <Button variant="ghost" size="sm" onPress={onBack} className="self-start">
                Back
              </Button>
            ) : null}
          </View>
          {unreadCount > 0 ? (
            <Button variant="secondary" size="sm" onPress={() => void markAllRead()}>
              Mark all read
            </Button>
          ) : null}
        </View>
      }
      loading={isLoading}
      error={error}
    >
      <View className="gap-8">
        <View className="gap-3">
          <Text weight="semibold">Grouped Notifications</Text>
          {isLoading ? (
            <SkeletonLoader variant="card" count={2} />
          ) : groupedNotifications.length === 0 ? (
            <Text variant="body-sm" color="secondary">
              No grouped notifications yet.
            </Text>
          ) : (
            groupedNotifications.map((group) => (
              <ActivityGroupSection
                key={group.key}
                title={group.label}
                activities={group.items}
                onActivityPress={handleActivityPress}
              />
            ))
          )}
        </View>

        <View className="gap-3">
          <Text weight="semibold">Timeline</Text>
          {isLoading ? (
            <SkeletonLoader variant="card" count={3} />
          ) : (
            <ActivityTimeline sections={timeline} onActivityPress={handleActivityPress} />
          )}
        </View>
      </View>
    </Screen>
  );
}

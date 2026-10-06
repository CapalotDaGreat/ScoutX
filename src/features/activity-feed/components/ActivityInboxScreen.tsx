import { View } from 'react-native';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { ActivityGroupSection } from '@/features/activity-feed/components/ActivityGroupSection';
import { ActivityTimeline } from '@/features/activity-feed/components/ActivityTimeline';
import { useActivities } from '@/features/activity-feed/context/ActivityProvider';
import { useActivityLabels } from '@/features/activity-feed/hooks/useActivityLabels';
import { type ActivityItem } from '@/features/activity-feed/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ActivityInboxScreenProps = {
  onBack?: () => void;
  embeddedInTabShell?: boolean;
};

export function ActivityInboxScreen({ onBack, embeddedInTabShell = false }: ActivityInboxScreenProps) {
  const { t } = useAppTranslation(['notifications', 'common']);
  const labels = useActivityLabels();
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
      title={t('notifications:activity.title')}
      subtitle={
        unreadCount > 0
          ? t('notifications:activity.subtitleUnread', { count: unreadCount })
          : t('notifications:activity.subtitle')
      }
      safeArea
      {...screenProps}
      headerLeading={
        onBack ? (
          <Button variant="ghost" size="sm" onPress={onBack} className="self-start -ml-1">
            {t('common:back')}
          </Button>
        ) : undefined
      }
      headerActions={
        unreadCount > 0 ? (
          <Button variant="secondary" size="sm" onPress={() => void markAllRead()}>
            {t('notifications:activity.markAllRead')}
          </Button>
        ) : undefined
      }
      loading={isLoading}
      error={error}
    >
      <View className="gap-8">
        <View className="gap-4">
          <View className="gap-1">
            <Text weight="semibold" accessibilityRole="header">
              {t('notifications:activity.groupedTitle')}
            </Text>
            <Text variant="caption" color="secondary">
              {t('notifications:activity.groupedSubtitle')}
            </Text>
          </View>
          {isLoading ? (
            <SkeletonLoader variant="card" count={2} />
          ) : groupedNotifications.length === 0 ? (
            <View className="rounded-2xl border border-dashed border-border bg-surface/50 px-5 py-10">
              <Text variant="body-sm" color="secondary" className="text-center">
                {t('notifications:activity.empty')}
              </Text>
            </View>
          ) : (
            groupedNotifications.map((group) => (
              <ActivityGroupSection
                key={group.key}
                title={labels.category(group.key)}
                activities={group.items}
                onActivityPress={handleActivityPress}
                previewCount={3}
              />
            ))
          )}
        </View>

        <CollapsibleSection
          title={t('notifications:activity.timelineTitle')}
          subtitle={t('notifications:activity.timelineSubtitle')}
          persistKey="activity-timeline"
        >
          {isLoading ? (
            <SkeletonLoader variant="card" count={3} />
          ) : (
            <ActivityTimeline sections={timeline} onActivityPress={handleActivityPress} />
          )}
        </CollapsibleSection>
      </View>
    </Screen>
  );
}

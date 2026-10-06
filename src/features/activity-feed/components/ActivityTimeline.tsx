import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { ActivityGroupSection } from '@/features/activity-feed/components/ActivityGroupSection';
import { useActivityLabels } from '@/features/activity-feed/hooks/useActivityLabels';
import { type ActivityItem, type ActivityTimelineSection } from '@/features/activity-feed/types';

export type ActivityTimelineProps = {
  sections: ActivityTimelineSection[];
  onActivityPress?: (activity: ActivityItem) => void;
};

export function ActivityTimeline({ sections, onActivityPress }: ActivityTimelineProps) {
  const labels = useActivityLabels();
  if (sections.length === 0) {
    return null;
  }

  return (
    <View className="gap-6">
      {sections.map((section) => (
        <View key={section.dateKey} className="gap-4">
          <Text weight="semibold" accessibilityRole="header">
            {labels.dateHeading(section.groups[0]?.items[0]?.createdAt ?? section.dateKey) || section.dateLabel}
          </Text>
          {section.groups.map((group) => (
            <ActivityGroupSection
              key={`${section.dateKey}-${group.key}`}
              title={labels.category(group.key)}
              activities={group.items}
              onActivityPress={onActivityPress}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { ActivityGroupSection } from '@/features/activity-feed/components/ActivityGroupSection';
import { type ActivityItem, type ActivityTimelineSection } from '@/features/activity-feed/types';

export type ActivityTimelineProps = {
  sections: ActivityTimelineSection[];
  onActivityPress?: (activity: ActivityItem) => void;
};

export function ActivityTimeline({ sections, onActivityPress }: ActivityTimelineProps) {
  if (sections.length === 0) {
    return null;
  }

  return (
    <View className="gap-6">
      {sections.map((section) => (
        <View key={section.dateKey} className="gap-4">
          <Text weight="semibold">{section.dateLabel}</Text>
          {section.groups.map((group) => (
            <ActivityGroupSection
              key={`${section.dateKey}-${group.key}`}
              title={group.label}
              activities={group.items}
              onActivityPress={onActivityPress}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

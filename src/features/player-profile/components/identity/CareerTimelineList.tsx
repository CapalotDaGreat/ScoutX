import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { type CareerTimelineEntry } from '@/features/player-profile/types/footballIdentity';

export type CareerTimelineListProps = {
  entries: CareerTimelineEntry[];
};

const typeLabels: Record<CareerTimelineEntry['type'], string> = {
  club: 'Club',
  achievement: 'Achievement',
  transfer: 'Transfer',
  education: 'Education',
};

export function CareerTimelineList({ entries }: CareerTimelineListProps) {
  if (entries.length === 0) {
    return (
      <Text variant="body-sm" color="secondary">
        Your career timeline will appear here.
      </Text>
    );
  }

  return (
    <View className="gap-3">
      {entries.map((entry, index) => (
        <View key={entry.id} className="flex-row gap-3">
          <View className="items-center">
            <View className="h-3 w-3 rounded-full bg-accent dark:bg-green-500" />
            {index < entries.length - 1 ? (
              <View className="mt-1 w-px flex-1 bg-border dark:bg-neutral-700" />
            ) : null}
          </View>
          <Card variant="outlined" padding="md" className="mb-1 flex-1">
            <Text variant="caption" color="accent" className="uppercase">
              {typeLabels[entry.type]}
            </Text>
            <Text weight="semibold" className="mt-1">
              {entry.title}
            </Text>
            <Text variant="body-sm" color="secondary">
              {entry.organization} · {entry.period}
            </Text>
            {entry.description ? (
              <Text variant="body-sm" color="secondary" className="mt-2">
                {entry.description}
              </Text>
            ) : null}
          </Card>
        </View>
      ))}
    </View>
  );
}

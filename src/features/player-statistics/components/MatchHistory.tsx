import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { type MatchHistoryItem } from '@/features/player-statistics/types';

export type MatchHistoryProps = {
  items: MatchHistoryItem[];
};

function formatMatchDate(date: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export function MatchHistory({ items }: MatchHistoryProps) {
  return (
    <Card variant="default" padding="lg" className="gap-4">
      <View>
        <Heading level={3}>Match History</Heading>
        <Text variant="body-sm" color="secondary" className="mt-1">
          Latest performances with calculated match output.
        </Text>
      </View>

      <View className="gap-3">
        {items.slice(0, 6).map((item) => (
          <View
            key={item.id}
            className="rounded-lg border border-border bg-background-secondary p-4 dark:border-neutral-800 dark:bg-neutral-950"
          >
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text weight="semibold">{item.opponent}</Text>
                <Text variant="caption" color="secondary" className="mt-1">
                  {item.competition} - {formatMatchDate(item.date)}
                </Text>
              </View>
              <Text weight="bold" color={item.result.startsWith('W') ? 'success' : 'secondary'}>
                {item.result}
              </Text>
            </View>

            <View className="mt-3 flex-row items-center justify-between gap-3">
              <Text variant="body-sm" color="secondary" className="flex-1">
                {item.summary}
              </Text>
              <Text weight="semibold" color="accent">
                {item.stats.matchRating.toFixed(1)}
              </Text>
            </View>

            <View className="mt-3 flex-row flex-wrap gap-2">
              <Text variant="caption" className="rounded bg-surface px-2 py-1 dark:bg-neutral-900">
                {item.stats.minutes} min
              </Text>
              <Text variant="caption" className="rounded bg-surface px-2 py-1 dark:bg-neutral-900">
                {item.stats.goals}G
              </Text>
              <Text variant="caption" className="rounded bg-surface px-2 py-1 dark:bg-neutral-900">
                {item.stats.assists}A
              </Text>
              <Text variant="caption" className="rounded bg-surface px-2 py-1 dark:bg-neutral-900">
                {item.stats.shots} shots
              </Text>
              <Text variant="caption" className="rounded bg-surface px-2 py-1 dark:bg-neutral-900">
                {item.stats.tackles} tackles
              </Text>
              <Text variant="caption" className="rounded bg-surface px-2 py-1 dark:bg-neutral-900">
                {item.stats.yellowCards} YC
              </Text>
              <Text variant="caption" className="rounded bg-surface px-2 py-1 dark:bg-neutral-900">
                {item.stats.redCards} RC
              </Text>
            </View>

            {item.notes ? (
              <Text variant="caption" color="secondary" className="mt-3">
                {item.notes}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </Card>
  );
}

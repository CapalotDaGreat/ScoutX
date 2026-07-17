import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { StatCard } from '@/components/primitives/StatCard';
import { Text } from '@/components/primitives/Text';
import { type StatisticSummaryItem } from '@/features/player-statistics/types';

export type StatisticsCardsProps = {
  items: StatisticSummaryItem[];
  /** Keys shown immediately. Remaining metrics sit behind "All metrics". */
  primaryKeys?: string[];
};

const DEFAULT_PRIMARY_KEYS = ['matches', 'goals', 'assists', 'minutes'];

function MetricGrid({ items }: { items: StatisticSummaryItem[] }) {
  return (
    <View className="flex-row flex-wrap gap-3">
      {items.map((item) => (
        <View key={item.key} className="min-w-[45%] flex-1">
          <StatCard
            label={item.label}
            value={item.formattedValue}
            trend={item.trend}
            variant="elevated"
          />
          <Text variant="caption" color="secondary" className="mt-1 px-1">
            {item.displaySubtitle}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function StatisticsCards({ items, primaryKeys = DEFAULT_PRIMARY_KEYS }: StatisticsCardsProps) {
  const primarySet = new Set(primaryKeys.map((key) => key.toLowerCase()));
  const primary = items.filter((item) => primarySet.has(item.key.toLowerCase())).slice(0, 4);
  const resolvedPrimary = primary.length > 0 ? primary : items.slice(0, 4);
  const primaryIds = new Set(resolvedPrimary.map((item) => item.key));
  const secondary = items.filter((item) => !primaryIds.has(item.key));

  return (
    <Animated.View entering={FadeInUp.duration(450)} className="gap-5">
      <MetricGrid items={resolvedPrimary} />
      {secondary.length > 0 ? (
        <CollapsibleSection
          title="All metrics"
          subtitle={`${secondary.length} additional performance totals`}
          persistKey="stats-all-metrics"
        >
          <MetricGrid items={secondary} />
        </CollapsibleSection>
      ) : null}
    </Animated.View>
  );
}

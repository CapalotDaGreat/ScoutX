import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { StatCard } from '@/components/primitives/StatCard';
import { Text } from '@/components/primitives/Text';
import { type StatisticSummaryItem } from '@/features/player-statistics/types';

export type StatisticsCardsProps = {
  items: StatisticSummaryItem[];
};

export function StatisticsCards({ items }: StatisticsCardsProps) {
  return (
    <Animated.View entering={FadeInUp.duration(450)} className="flex-row flex-wrap gap-3">
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
    </Animated.View>
  );
}

import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { StatCard } from '@/components/primitives/StatCard';
import { Text } from '@/components/primitives/Text';
import { type PlayerProfileStat } from '@/features/player-profile/types';
import { useStatisticLabels } from '@/features/player-statistics/hooks/useStatisticLabels';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export type ProfileStatsGridProps = {
  stats: PlayerProfileStat[];
  /** Compact four-up row matching player home mockups */
  compact?: boolean;
};

export function ProfileStatsGrid({ stats, compact = false }: ProfileStatsGridProps) {
  const labels = useStatisticLabels();
  const reduceMotion = useReducedMotion();
  if (compact) {
    return (
      <Animated.View
        entering={reduceMotion ? undefined : FadeInUp.delay(80).duration(400)}
        className="flex-row gap-2 rounded-xl border border-border bg-surface p-3"
      >
        {stats.map((stat) => (
          <View key={stat.label} className="flex-1 items-center gap-1">
            <Text weight="bold" className="text-center text-stat-lg text-foreground">
              {stat.value}
            </Text>
            <Text variant="caption" color="secondary" className="text-center" numberOfLines={1}>
              {labels.profileStat(stat).label}
            </Text>
          </View>
        ))}
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInUp.delay(100).duration(500)}
      className="flex-row flex-wrap gap-3"
    >
      {stats.map((stat) => {
        const display = labels.profileStat(stat);
        return (
          <View key={stat.label} className="min-w-[45%] flex-1">
            <StatCard label={display.label} value={stat.value} trend={display.trend} variant="elevated" />
          </View>
        );
      })}
    </Animated.View>
  );
}

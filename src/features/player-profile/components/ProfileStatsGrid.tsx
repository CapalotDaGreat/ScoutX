import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { StatCard } from '@/components/primitives/StatCard';
import { type PlayerProfileStat } from '@/features/player-profile/types';

export type ProfileStatsGridProps = {
  stats: PlayerProfileStat[];
};

export function ProfileStatsGrid({ stats }: ProfileStatsGridProps) {
  return (
    <Animated.View entering={FadeInUp.delay(100).duration(500)} className="flex-row flex-wrap gap-3">
      {stats.map((stat) => (
        <View key={stat.label} className="min-w-[45%] flex-1">
          <StatCard label={stat.label} value={stat.value} trend={stat.trend} variant="elevated" />
        </View>
      ))}
    </Animated.View>
  );
}

import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonCard } from '@/components/feedback/SkeletonLoader';
import { Section } from '@/components/layout/Section';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { MatchHistory } from '@/features/player-statistics/components/MatchHistory';
import { ProgressGraphs } from '@/features/player-statistics/components/ProgressGraphs';
import { RadarChart } from '@/features/player-statistics/components/RadarChart';
import { StatisticsCards } from '@/features/player-statistics/components/StatisticsCards';
import { usePlayerStatistics } from '@/features/player-statistics/hooks/usePlayerStatistics';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';

export type PlayerStatisticsSectionProps = {
  matches?: PlayerMatchStatistics[];
  onLogMatchPress?: () => void;
};

export function PlayerStatisticsSection({ matches, onLogMatchPress }: PlayerStatisticsSectionProps) {
  const { overview, isLoading, error } = usePlayerStatistics({ matches });

  if (isLoading) {
    return (
      <Section title="Statistics" subtitle="Calculating player performance trends">
        <SkeletonCard />
        <SkeletonCard />
      </Section>
    );
  }

  if (error) {
    return (
      <Section title="Statistics" subtitle="Performance data">
        <EmptyState title="Statistics unavailable" description={error} />
      </Section>
    );
  }

  if (overview.matchCount === 0) {
    return (
      <Section title="Statistics" subtitle="Performance data">
        <EmptyState
          title="No match data yet"
          description="Statistics will appear after match records are available."
          actionLabel="Log Match"
          onAction={onLogMatchPress}
        />
      </Section>
    );
  }

  return (
    <Animated.View entering={FadeInUp.delay(250).duration(500)}>
      <Section
        title="Statistics"
        subtitle={`${overview.matchCount} matches analyzed with totals, averages and trends`}
        action={
          onLogMatchPress ? (
            <Button variant="secondary" size="sm" onPress={onLogMatchPress}>
              Log Match
            </Button>
          ) : undefined
        }
        gap="lg"
      >
        <View className="gap-4">
          <StatisticsCards items={overview.totals} />
          <RadarChart points={overview.radar} />
          <ProgressGraphs graphs={overview.progressGraphs} />
          <MatchHistory items={overview.matchHistory} />
          <Text variant="caption" color="secondary">
            Trends compare recent match averages against the previous sample.
          </Text>
        </View>
      </Section>
    </Animated.View>
  );
}

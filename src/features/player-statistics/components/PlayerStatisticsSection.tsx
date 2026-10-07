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
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export type PlayerStatisticsSectionProps = {
  matches?: PlayerMatchStatistics[];
  onLogMatchPress?: () => void;
};

export function PlayerStatisticsSection({ matches, onLogMatchPress }: PlayerStatisticsSectionProps) {
  const { overview, isLoading, error } = usePlayerStatistics({ matches });
  const { t } = useAppTranslation('statistics');
  const reduceMotion = useReducedMotion();

  if (isLoading) {
    return (
      <Section title={t('title')} subtitle={t('loadingSubtitle')}>
        <SkeletonCard />
        <SkeletonCard />
      </Section>
    );
  }

  if (error) {
    return (
      <Section title={t('title')} subtitle={t('summary.sectionSubtitle')}>
        <EmptyState title={t('summary.unavailable')} description={error} />
      </Section>
    );
  }

  if (overview.matchCount === 0) {
    return (
      <Section title={t('title')} subtitle={t('summary.sectionSubtitle')}>
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          actionLabel={onLogMatchPress ? t('logMatch') : undefined}
          onAction={onLogMatchPress}
        />
      </Section>
    );
  }

  const recordedTotals = overview.totals.filter((item) => item.recordedCount > 0);
  const recordedKeys = new Set(recordedTotals.map((item) => item.key));
  const recordedRadar = overview.radar.filter((point) => recordedKeys.has(point.key));
  const recordedGraphs = overview.progressGraphs.filter((graph) => graph.points.length > 0);

  return (
    <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(250).duration(500)}>
      <Section
        title={t('title')}
        subtitle={t('summary.matchesAnalysed', { count: overview.matchCount })}
        action={
          onLogMatchPress ? (
            <Button variant="secondary" size="sm" onPress={onLogMatchPress}>
              {t('logMatch')}
            </Button>
          ) : undefined
        }
        gap="lg"
      >
        <View className="gap-4">
          <StatisticsCards items={recordedTotals} />
          {recordedRadar.length >= 3 ? <RadarChart points={recordedRadar} /> : null}
          {recordedGraphs.length > 0 ? <ProgressGraphs graphs={recordedGraphs} /> : null}
          <MatchHistory items={overview.matchHistory} maxItems={6} />
          <Text variant="caption" color="secondary">
            {t('summary.trendNote')}
          </Text>
        </View>
      </Section>
    </Animated.View>
  );
}

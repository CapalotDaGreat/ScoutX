import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { EmptyState } from '@/components/feedback/EmptyState';
import { MatchHistory } from '@/features/player-statistics/components/MatchHistory';
import { RadarChart } from '@/features/player-statistics/components/RadarChart';
import { usePlayerStatistics } from '@/features/player-statistics/hooks/usePlayerStatistics';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type HomePerformanceOverviewProps = {
  matches?: PlayerMatchStatistics[];
  onLogMatchPress?: () => void;
  /** Opens the full Statistics experience (View all matches). */
  onViewAllMatchesPress?: () => void;
};

export function HomePerformanceOverview({
  matches,
  onLogMatchPress,
  onViewAllMatchesPress,
}: HomePerformanceOverviewProps) {
  const { t } = useAppTranslation(['portfolio', 'statistics', 'common']);
  const { overview, isLoading } = usePlayerStatistics({ matches });

  if (isLoading) {
    return null;
  }

  if (overview.matchCount === 0) {
    return (
      <Card variant="elevated" padding="lg">
        <EmptyState
          title={t('statistics:emptyTitle', { defaultValue: 'No match data yet' })}
          description={t('statistics:emptyDescription', {
            defaultValue: 'Log your first match to unlock radar and recent form.',
          })}
          actionLabel={t('statistics:logMatch')}
          onAction={onLogMatchPress}
        />
      </Card>
    );
  }

  return (
    <Animated.View entering={FadeInUp.delay(120).duration(450)} className="gap-5">
      <View className="gap-3">
        <View className="flex-row items-center justify-between px-1">
          <View className="min-w-0 flex-1 pr-3">
            <Heading level={3}>{t('portfolio:recentMatches')}</Heading>
            <Text variant="caption" color="secondary" className="mt-0.5">
              {t('portfolio:today.recentFormSubtitle')}
            </Text>
          </View>
        </View>
        <MatchHistory
          items={overview.matchHistory}
          maxItems={3}
          onViewAllPress={onViewAllMatchesPress}
          compact
        />
      </View>

      <CollapsibleSection
        title={t('portfolio:performanceOverview')}
        subtitle={t('portfolio:performanceOverviewSubtitle')}
        persistKey="home-performance-radar"
      >
        <RadarChart points={overview.radar} />
      </CollapsibleSection>
    </Animated.View>
  );
}

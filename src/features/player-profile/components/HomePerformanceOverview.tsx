import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
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
};

export function HomePerformanceOverview({
  matches,
  onLogMatchPress,
}: HomePerformanceOverviewProps) {
  const { t } = useAppTranslation(['portfolio', 'statistics']);
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
    <Animated.View entering={FadeInUp.delay(120).duration(450)} className="gap-4">
      <Card variant="elevated" padding="lg" className="gap-3">
        <View>
          <Heading level={3}>{t('portfolio:performanceOverview')}</Heading>
          <Text variant="body-sm" color="secondary" className="mt-1">
            {t('portfolio:performanceOverviewSubtitle')}
          </Text>
        </View>
        <RadarChart points={overview.radar} />
      </Card>

      <View className="gap-2">
        <View className="flex-row items-center justify-between px-1">
          <Heading level={3}>{t('portfolio:recentMatches')}</Heading>
        </View>
        <MatchHistory items={overview.matchHistory} maxItems={3} />
      </View>
    </Animated.View>
  );
}

import { View } from 'react-native';
import { BarChart3, Clapperboard } from 'lucide-react-native';
import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Button } from '@/components/primitives/Button';
import { FloatingActionButton } from '@/components/primitives/FloatingActionButton';
import { MatchHistory } from '@/features/player-statistics/components/MatchHistory';
import { ProgressGraphs } from '@/features/player-statistics/components/ProgressGraphs';
import { RadarChart } from '@/features/player-statistics/components/RadarChart';
import { StatisticsCards } from '@/features/player-statistics/components/StatisticsCards';
import { AiInsightPanel } from '@/features/ai-insights';
import { type AiInsightContext } from '@/features/ai-insights';
import { usePlayerStatistics } from '@/features/player-statistics/hooks/usePlayerStatistics';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

export type StatisticsScreenProps = {
  matches?: PlayerMatchStatistics[];
  aiInsightContext?: AiInsightContext | null;
  onLogMatchPress?: () => void;
  onAnalyzeMatchVideoPress?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  embeddedInTabShell?: boolean;
  nestedUnderSegment?: boolean;
};

export function StatisticsScreen({
  matches,
  aiInsightContext = null,
  onLogMatchPress,
  onAnalyzeMatchVideoPress,
  onRefresh,
  refreshing = false,
  embeddedInTabShell = false,
  nestedUnderSegment = false,
}: StatisticsScreenProps) {
  const { t } = useAppTranslation(['statistics', 'common', 'errors']);
  const { colors } = useTheme();
  const { overview, isLoading, error } = usePlayerStatistics({ matches });
  const screenProps = {
    ...(embeddedInTabShell ? { embeddedInTabShell: true as const } : {}),
    ...(nestedUnderSegment ? { safeAreaEdges: ['left', 'right'] as Array<'left' | 'right'> } : {}),
  };
  const fabBottomOffset = embeddedInTabShell ? 72 : undefined;

  if (isLoading) {
    return (
      <Screen title="Statistics" subtitle="Loading performance data" safeArea {...screenProps}>
        <SkeletonLoader variant="card" count={4} />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen
        title="Statistics"
        subtitle="Performance analytics"
        error={error}
        onRetry={onRefresh}
        safeArea
        {...screenProps}
      >
        <View />
      </Screen>
    );
  }

  if (overview.matchCount === 0) {
    return (
      <Screen title="Statistics" subtitle="Performance analytics" safeArea {...screenProps}>
        <View className="gap-4">
          <EmptyState
            title="No match data yet"
            description="Log a match or upload match film for AI stats and coaching feedback."
            actionLabel="Log Match"
            onAction={onLogMatchPress}
          />
          {onAnalyzeMatchVideoPress ? (
            <Button
              variant="accent"
              onPress={onAnalyzeMatchVideoPress}
              leftIcon={<Clapperboard size={18} color={colors.accentForeground} />}
            >
              Analyze match video
            </Button>
          ) : null}
        </View>
      </Screen>
    );
  }

  return (
    <View className="flex-1">
      <Screen
        title="Statistics"
        subtitle={`${overview.matchCount} matches tracked with automatic totals, averages and trends.`}
        onRefresh={onRefresh}
        refreshing={refreshing}
        safeArea
        contentClassName="gap-8"
        {...screenProps}
      >
        {onAnalyzeMatchVideoPress ? (
          <Button
            variant="secondary"
            onPress={onAnalyzeMatchVideoPress}
            leftIcon={<Clapperboard size={18} color={colors.accent} />}
          >
            Analyze match video with AI
          </Button>
        ) : null}
        <StatisticsCards items={overview.totals} />
        <AiInsightPanel
          insightType="performance_summary"
          context={aiInsightContext}
          enabled={Boolean(aiInsightContext)}
        />
        <AiInsightPanel
          insightType="improvement_suggestions"
          context={aiInsightContext}
          enabled={Boolean(aiInsightContext)}
        />
        <RadarChart points={overview.radar} />
        <ProgressGraphs graphs={overview.progressGraphs} />
        <MatchHistory items={overview.matchHistory} />
      </Screen>

      {onLogMatchPress && !embeddedInTabShell ? (
        <FloatingActionButton
          icon={<BarChart3 size={24} color={colors.accentForeground} strokeWidth={2} />}
          accessibilityLabel="Log match"
          onPress={onLogMatchPress}
          bottomOffset={fabBottomOffset}
        />
      ) : null}
    </View>
  );
}

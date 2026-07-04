import { View } from 'react-native';
import { BarChart3 } from 'lucide-react-native';
import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { FloatingActionButton } from '@/components/primitives/FloatingActionButton';
import { MatchHistory } from '@/features/player-statistics/components/MatchHistory';
import { ProgressGraphs } from '@/features/player-statistics/components/ProgressGraphs';
import { RadarChart } from '@/features/player-statistics/components/RadarChart';
import { StatisticsCards } from '@/features/player-statistics/components/StatisticsCards';
import { AiInsightPanel } from '@/features/ai-insights';
import { type AiInsightContext } from '@/features/ai-insights';
import { usePlayerStatistics } from '@/features/player-statistics/hooks/usePlayerStatistics';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';
import { useTheme } from '@/theme';

export type StatisticsScreenProps = {
  matches?: PlayerMatchStatistics[];
  aiInsightContext?: AiInsightContext | null;
  onLogMatchPress?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
};

export function StatisticsScreen({
  matches,
  aiInsightContext = null,
  onLogMatchPress,
  onRefresh,
  refreshing = false,
}: StatisticsScreenProps) {
  const { colors } = useTheme();
  const { overview, isLoading, error } = usePlayerStatistics({ matches });

  if (isLoading) {
    return (
      <Screen title="Statistics" subtitle="Loading performance data" safeArea>
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
      >
        <View />
      </Screen>
    );
  }

  if (overview.matchCount === 0) {
    return (
      <Screen title="Statistics" subtitle="Performance analytics" safeArea>
        <EmptyState
          title="No match data yet"
          description="Log your first match to unlock totals, averages, trends, and charts."
          actionLabel="Log Match"
          onAction={onLogMatchPress}
        />
      </Screen>
    );
  }

  return (
    <View className="flex-1">
      <Screen
        title="Statistics"
        subtitle={`${overview.matchCount} matches tracked with automatic totals, averages and trends`}
        onRefresh={onRefresh}
        refreshing={refreshing}
        safeArea
        contentClassName="gap-8"
      >
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

      {onLogMatchPress ? (
        <FloatingActionButton
          icon={<BarChart3 size={24} color={colors.accentForeground} strokeWidth={2} />}
          accessibilityLabel="Log match"
          onPress={onLogMatchPress}
        />
      ) : null}
    </View>
  );
}

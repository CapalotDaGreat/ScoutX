import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { BarChart3, Clapperboard } from 'lucide-react-native';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { FloatingActionButton } from '@/components/primitives/FloatingActionButton';
import { Text } from '@/components/primitives/Text';
import { MatchHistory } from '@/features/player-statistics/components/MatchHistory';
import { MatchReflectionModal } from '@/features/player-statistics/components/MatchReflectionModal';
import { ProgressGraphs } from '@/features/player-statistics/components/ProgressGraphs';
import { RadarChart } from '@/features/player-statistics/components/RadarChart';
import { StatisticsCards } from '@/features/player-statistics/components/StatisticsCards';
import { AiInsightPanel } from '@/features/ai-insights';
import { type AiInsightContext } from '@/features/ai-insights';
import { usePlayerStatistics } from '@/features/player-statistics/hooks/usePlayerStatistics';
import {
  type MatchHistoryItem,
  type MatchReflection,
  type PlayerMatchStatistics,
} from '@/features/player-statistics/types';
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
  renderMatchFooter?: (matchId: string) => ReactNode;
  /** Persists a post-match reflection; when set, each match offers reflection editing. */
  onSaveReflection?: (matchId: string, reflection: MatchReflection | null) => Promise<void>;
  /** When set (e.g. from the Today reflection prompt), open the editor for this match once. */
  focusReflectionMatchId?: string;
  onReflectionFocusHandled?: () => void;
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
  renderMatchFooter,
  onSaveReflection,
  focusReflectionMatchId,
  onReflectionFocusHandled,
}: StatisticsScreenProps) {
  const { t } = useAppTranslation(['statistics']);
  const { colors } = useTheme();
  const { overview, isLoading, error } = usePlayerStatistics({ matches });
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [reflectionItem, setReflectionItem] = useState<MatchHistoryItem | null>(null);
  const handledFocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusReflectionMatchId) {
      handledFocusRef.current = null;
      return;
    }
    if (handledFocusRef.current === focusReflectionMatchId) {
      return;
    }
    const item = overview.matchHistory.find((entry) => entry.id === focusReflectionMatchId);
    if (item) {
      handledFocusRef.current = focusReflectionMatchId;
      setShowFullHistory(true);
      setReflectionItem(item);
      onReflectionFocusHandled?.();
    }
  }, [focusReflectionMatchId, onReflectionFocusHandled, overview.matchHistory]);
  const screenProps = {
    ...(embeddedInTabShell ? { embeddedInTabShell: true as const } : {}),
    ...(nestedUnderSegment ? { safeAreaEdges: ['left', 'right'] as Array<'left' | 'right'> } : {}),
  };
  const fabBottomOffset = embeddedInTabShell ? 72 : undefined;

  if (isLoading) {
    return (
      <Screen title={t('title')} subtitle={t('loadingSubtitle')} safeArea {...screenProps}>
        <SkeletonLoader variant="card" count={4} />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen
        title={t('title')}
        subtitle={t('analyticsSubtitle')}
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
      <Screen title={t('title')} subtitle={t('analyticsSubtitle')} safeArea {...screenProps}>
        <View className="gap-4">
          <EmptyState
            title={t('emptyTitle')}
            description={t('emptyDescriptionVideo')}
            actionLabel={t('logMatch')}
            onAction={onLogMatchPress}
          />
          {onAnalyzeMatchVideoPress ? (
            <Button
              variant="accent"
              onPress={onAnalyzeMatchVideoPress}
              leftIcon={<Clapperboard size={18} color={colors.accentForeground} />}
            >
              {t('uploadAnalyze')}
            </Button>
          ) : null}
        </View>
      </Screen>
    );
  }

  return (
    <View className="flex-1">
      <Screen
        title={t('title')}
        subtitle={t('headlineSubtitle', { count: overview.matchCount })}
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
            {t('uploadAnalyzeAi')}
          </Button>
        ) : null}

        {onSaveReflection && overview.matchHistory[0] && !overview.matchHistory[0].reflection ? (
          <Card variant="prestige" padding="md" className="gap-2">
            <Text weight="semibold">{t('reflection.promptTitle')}</Text>
            <Text variant="body-sm" color="secondary">
              {t('reflection.promptBody', { opponent: overview.matchHistory[0].opponent })}
            </Text>
            <Button
              variant="accent"
              accessibilityLabel={t('reflection.add', { opponent: overview.matchHistory[0].opponent })}
              onPress={() => setReflectionItem(overview.matchHistory[0] ?? null)}
            >
              {t('reflection.addShort')}
            </Button>
          </Card>
        ) : null}

        <StatisticsCards items={overview.totals} />

        <CollapsibleSection
          title={t('attributeProfile')}
          subtitle={t('attributeProfileSubtitle')}
          persistKey="stats-radar"
        >
          <RadarChart points={overview.radar} />
        </CollapsibleSection>

        <CollapsibleSection
          title={t('aiCoaching')}
          subtitle={t('aiCoachingSubtitle')}
          persistKey="stats-ai-coaching"
        >
          <View className="gap-4">
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
          </View>
        </CollapsibleSection>

        <CollapsibleSection
          title={t('performanceTrends')}
          subtitle={t('performanceTrendsSubtitle')}
          persistKey="stats-trends"
        >
          <ProgressGraphs graphs={overview.progressGraphs} />
        </CollapsibleSection>

        <MatchHistory
          items={overview.matchHistory}
          maxItems={showFullHistory ? undefined : 5}
          onViewAllPress={
            overview.matchHistory.length > 5 && !showFullHistory
              ? () => setShowFullHistory(true)
              : undefined
          }
          renderItemFooter={renderMatchFooter ? (item) => renderMatchFooter(item.id) : undefined}
          onReflectPress={onSaveReflection ? (item) => setReflectionItem(item) : undefined}
        />
      </Screen>

      {onSaveReflection ? (
        <MatchReflectionModal
          visible={reflectionItem !== null}
          item={reflectionItem}
          onClose={() => setReflectionItem(null)}
          onSave={onSaveReflection}
        />
      ) : null}

      {onLogMatchPress && !embeddedInTabShell ? (
        <FloatingActionButton
          icon={<BarChart3 size={24} color={colors.accentForeground} strokeWidth={2} />}
          accessibilityLabel={t('logMatch')}
          onPress={onLogMatchPress}
          bottomOffset={fabBottomOffset}
        />
      ) : null}
    </View>
  );
}

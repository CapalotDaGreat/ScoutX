import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { AiCareerCoachCard } from '@/features/ai-insights/components/AiCareerCoachCard';
import { MilestonesSection, usePlayerMilestones } from '@/features/career-milestones';
import { buildUnifiedCareerTimeline } from '@/features/career-timeline/services/careerTimelineService';
import { CareerReplayCard } from '@/features/career-replay/components/CareerReplayCard';
import { FootballJourneySection } from '@/features/football-journey';
import { PerformanceInsightsCard } from '@/features/performance-insights/components/PerformanceInsightsCard';
import { usePlayerWorkspace } from '@/features/player-profile/context/PlayerWorkspaceProvider';
import { WeeklyFootballReportCard } from '@/features/weekly-report/components/WeeklyFootballReportCard';
import { useWeeklyReportNotifier } from '@/features/weekly-report/hooks/useWeeklyReportNotifier';
import { usePortfolioAnalytics } from '@/features/portfolio-analytics/hooks/usePortfolioAnalytics';
import { CareerStorySection } from '@/features/career-story/components/CareerStorySection';
import { buildCareerMoments } from '@/features/career-story/services/careerMoments';
import { persistCareerSnapshot } from '@/features/career-story/services/persistCareerSnapshot';
import { buildFootballStory, buildYearInReviewSnapshot } from '@/features/career-story/services/yearInReview';
import { PlayerCoachObservationsCard } from '@/features/coach-mode/components/PlayerCoachObservationsCard';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type CareerScreenProps = {
  embeddedInTabShell?: boolean;
  nestedUnderSegment?: boolean;
  onEditJourneyPress?: () => void;
  onCareerReplayPress?: () => void;
};

export function CareerScreen({
  embeddedInTabShell = false,
  nestedUnderSegment = false,
  onEditJourneyPress,
  onCareerReplayPress,
}: CareerScreenProps) {
  const { t } = useAppTranslation(['career', 'common']);
  const { profile, isLoading, trustState } = usePlayerWorkspace();
  const { analytics } = usePortfolioAnalytics(profile?.id);
  const { earned, recentlyEarned } = usePlayerMilestones(profile, trustState.recommendations);
  useWeeklyReportNotifier(profile, analytics, trustState.recommendations);
  const timeline = useMemo(
    () => buildUnifiedCareerTimeline(profile?.footballJourney),
    [profile?.footballJourney],
  );
  const storyBundle = useMemo(() => {
    const moments = buildCareerMoments({
      matches: (profile?.statisticsMatches ?? []).map((match) => ({
        id: match.id,
        date: match.date,
        opponent: match.opponent,
        result: match.result,
        goals: match.goals,
        assists: match.assists,
      })),
      journey: profile?.footballJourney?.entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        date: entry.date,
        subtitle: entry.subtitle,
      })),
    });
    const year = new Date().getFullYear();
    const yearMatches = (profile?.statisticsMatches ?? []).filter(
      (match) => new Date(match.date).getFullYear() === year,
    );
    const goals = yearMatches.length === 0 ? null : yearMatches.reduce((sum, match) => sum + match.goals, 0);
    const assists = yearMatches.length === 0 ? null : yearMatches.reduce((sum, match) => sum + match.assists, 0);
    return {
      snapshot: buildYearInReviewSnapshot(profile?.id ?? 'player', year, moments, { goals, assists }),
      story: buildFootballStory(profile?.id ?? 'player', moments),
    };
  }, [profile]);
  useEffect(() => {
    if (!profile?.id) {
      return;
    }
    void persistCareerSnapshot(storyBundle.snapshot);
  }, [profile?.id, storyBundle.snapshot]);
  const [showFullTimeline, setShowFullTimeline] = useState(false);

  const screenProps = {
    ...(embeddedInTabShell ? { embeddedInTabShell: true as const } : {}),
    ...(nestedUnderSegment ? { safeAreaEdges: ['left', 'right'] as Array<'left' | 'right'> } : {}),
  };

  if (isLoading) {
    return (
      <Screen title={t('career:title')} subtitle={t('career:loadingSubtitle')} safeArea {...screenProps}>
        <SkeletonLoader variant="card" count={3} />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen title={t('career:title')} subtitle={t('career:loadingSubtitle')} safeArea {...screenProps}>
        <EmptyState
          title={t('career:noIdentityTitle')}
          description={t('career:noIdentityDescription')}
        />
      </Screen>
    );
  }

  const previewEntries = showFullTimeline ? timeline : timeline.slice(0, 5);

  return (
    <Screen
      title={t('career:title')}
      subtitle={t('career:subtitle')}
      safeArea
      contentClassName="gap-6"
      {...screenProps}
    >
      <View className="gap-6">
        <WeeklyFootballReportCard
          profile={profile}
          recommendations={trustState.recommendations}
        />
        <CareerReplayCard profile={profile} onOpenPress={onCareerReplayPress} />
        <CareerStorySection story={storyBundle.story} snapshot={storyBundle.snapshot} />
        <PlayerCoachObservationsCard playerId={profile.id} />
        <MilestonesSection earned={earned} recentlyEarned={recentlyEarned} previewCount={4} />

        <CollapsibleSection
          title={t('career:coachingInsights')}
          subtitle={t('career:coachingInsightsSubtitle')}
          persistKey="career-coaching"
        >
          <View className="gap-4">
            <AiCareerCoachCard profile={profile} />
            <PerformanceInsightsCard profile={profile} />
          </View>
        </CollapsibleSection>

        <Card variant="outlined" padding="md" className="gap-4">
          <View>
            <Text variant="overline" color="secondary">
              {t('career:footballTimeline')}
            </Text>
            <Text weight="semibold" className="text-lg">
              {t('career:careerStory')}
            </Text>
            <Text variant="caption" color="secondary" className="mt-1">
              {timeline.length === 0
                ? t('career:noEntries')
                : t('career:momentsCount', { count: timeline.length })}
            </Text>
          </View>

          {timeline.length === 0 ? (
            <EmptyState
              title={t('career:timelineEmptyTitle')}
              description={t('career:timelineEmptyDescription')}
            />
          ) : (
            <>
              <FootballJourneySection
                entries={previewEntries}
                editable={Boolean(onEditJourneyPress)}
                onEditPress={onEditJourneyPress}
              />
              {timeline.length > 5 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => setShowFullTimeline((current) => !current)}
                  className="self-start"
                >
                  {showFullTimeline ? t('common:seeLess') : t('common:seeMore')}
                </Button>
              ) : null}
            </>
          )}
        </Card>
      </View>
    </Screen>
  );
}

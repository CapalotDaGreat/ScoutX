import { useMemo } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Text } from '@/components/primitives/Text';
import { AiCareerCoachCard } from '@/features/ai-insights/components/AiCareerCoachCard';
import { MilestonesSection, usePlayerMilestones } from '@/features/career-milestones';
import { buildUnifiedCareerTimeline } from '@/features/career-timeline/services/careerTimelineService';
import { CareerReplayCard } from '@/features/career-replay/components/CareerReplayCard';
import { FootballJourneySection } from '@/features/football-journey';
import { PerformanceInsightsCard } from '@/features/performance-insights/components/PerformanceInsightsCard';
import { usePortfolioAnalytics } from '@/features/portfolio-analytics/hooks/usePortfolioAnalytics';
import { PortfolioAnalyticsCard } from '@/features/portfolio-analytics/components/PortfolioAnalyticsCard';
import { usePlayerWorkspace } from '@/features/player-profile/context/PlayerWorkspaceProvider';
import { WeeklyFootballReportCard } from '@/features/weekly-report/components/WeeklyFootballReportCard';
import { useWeeklyReportNotifier } from '@/features/weekly-report/hooks/useWeeklyReportNotifier';

export type CareerScreenProps = {
  embeddedInTabShell?: boolean;
  onEditJourneyPress?: () => void;
  onCareerReplayPress?: () => void;
};

export function CareerScreen({
  embeddedInTabShell = false,
  onEditJourneyPress,
  onCareerReplayPress,
}: CareerScreenProps) {
  const { profile, isLoading, trustState } = usePlayerWorkspace();
  const { analytics } = usePortfolioAnalytics(profile?.id);
  const { earned, recentlyEarned } = usePlayerMilestones(profile, trustState.recommendations);
  useWeeklyReportNotifier(profile, analytics, trustState.recommendations);
  const timeline = useMemo(
    () => buildUnifiedCareerTimeline(profile?.footballJourney),
    [profile?.footballJourney],
  );

  const screenProps = embeddedInTabShell ? { embeddedInTabShell: true as const } : {};

  if (isLoading) {
    return (
      <Screen title="Career" subtitle="Your football story" safeArea {...screenProps}>
        <SkeletonLoader variant="card" count={3} />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen title="Career" subtitle="Your football story" safeArea {...screenProps}>
        <EmptyState
          title="No identity yet"
          description="Complete your football identity to start building your career timeline."
        />
      </Screen>
    );
  }

  return (
    <Screen
      title="Career"
      subtitle="Every match, milestone, and moment in one timeline"
      safeArea
      {...screenProps}
    >
      <View className="gap-4">
        <WeeklyFootballReportCard
          profile={profile}
          recommendations={trustState.recommendations}
        />
        <AiCareerCoachCard profile={profile} />
        <CareerReplayCard profile={profile} onOpenPress={onCareerReplayPress} />
        <MilestonesSection earned={earned} recentlyEarned={recentlyEarned} />
        <PerformanceInsightsCard profile={profile} />
        <PortfolioAnalyticsCard playerId={profile.id} profile={profile} />
        <View className="rounded-2xl border border-border bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
          <Text variant="overline" color="secondary">
            Football timeline
          </Text>
          <Text weight="semibold" className="mb-3 text-lg">
            Your career story
          </Text>
          {timeline.length === 0 ? (
            <EmptyState
              title="Your timeline is empty"
              description="Log matches, add journey entries, and enable your portfolio to build your story automatically."
            />
          ) : (
            <FootballJourneySection
              entries={timeline}
              editable={Boolean(onEditJourneyPress)}
              onEditPress={onEditJourneyPress}
            />
          )}
        </View>
      </View>
    </Screen>
  );
}

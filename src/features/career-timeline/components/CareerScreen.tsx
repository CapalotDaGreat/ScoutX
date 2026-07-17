import { useMemo, useState } from 'react';
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
  const { profile, isLoading, trustState } = usePlayerWorkspace();
  const { analytics } = usePortfolioAnalytics(profile?.id);
  const { earned, recentlyEarned } = usePlayerMilestones(profile, trustState.recommendations);
  useWeeklyReportNotifier(profile, analytics, trustState.recommendations);
  const timeline = useMemo(
    () => buildUnifiedCareerTimeline(profile?.footballJourney),
    [profile?.footballJourney],
  );
  const [showFullTimeline, setShowFullTimeline] = useState(false);

  const screenProps = {
    ...(embeddedInTabShell ? { embeddedInTabShell: true as const } : {}),
    ...(nestedUnderSegment ? { safeAreaEdges: ['left', 'right'] as Array<'left' | 'right'> } : {}),
  };

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

  const previewEntries = showFullTimeline ? timeline : timeline.slice(0, 5);

  return (
    <Screen
      title="Career"
      subtitle="Your journey, milestones, and weekly growth"
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
        <MilestonesSection earned={earned} recentlyEarned={recentlyEarned} previewCount={4} />

        <CollapsibleSection
          title="Coaching & insights"
          subtitle="AI coach and performance signals"
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
              Football timeline
            </Text>
            <Text weight="semibold" className="text-lg">
              Your career story
            </Text>
            <Text variant="caption" color="secondary" className="mt-1">
              {timeline.length === 0
                ? 'Start logging moments to build your story'
                : `${timeline.length} moments · newest first`}
            </Text>
          </View>

          {timeline.length === 0 ? (
            <EmptyState
              title="Your timeline is empty"
              description="Log matches, add journey entries, and enable your portfolio to build your story automatically."
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
                  {showFullTimeline ? 'Show less' : `See more · ${timeline.length - 5}`}
                </Button>
              ) : null}
            </>
          )}
        </Card>
      </View>
    </Screen>
  );
}

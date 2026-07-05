import { type ReactNode } from 'react';
import { Image, ScrollView, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Avatar } from '@/components/primitives/Avatar';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { FootballJourneySection } from '@/features/football-journey';
import { HighlightVideosSection } from '@/features/highlight-videos';
import { GpsHeatmap } from '@/features/gps/components/GpsHeatmap';
import { PerformanceSummary } from '@/features/player-profile/components/PerformanceSummary';
import { ProfileStatsGrid } from '@/features/player-profile/components/ProfileStatsGrid';
import { RecommendationCard } from '@/features/trust-system/components/RecommendationCard';
import { PlayerStatisticsSection } from '@/features/player-statistics';
import { isPortfolioSectionVisible } from '@/features/public-portfolio/models/PortfolioModel';
import { usePublicPortfolio } from '@/features/public-portfolio/hooks/usePublicPortfolio';
import { useOwnPortfolioPreview } from '@/features/public-portfolio/hooks/useOwnPortfolioPreview';
import { type PublicPortfolioData } from '@/features/public-portfolio/types';

export type PublicPortfolioScreenProps = {
  playerId: string;
  onBack?: () => void;
  previewMode?: boolean;
  previewData?: PublicPortfolioData;
};

function PortfolioSection({
  title,
  subtitle,
  children,
  index,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  index: number;
}) {
  return (
    <Animated.View
      entering={FadeInUp.delay(Math.min(index, 6) * 50).duration(350)}
      className="gap-3 rounded-2xl border border-border bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
    >
      <View>
        <Text variant="overline" color="secondary">
          Portfolio
        </Text>
        <Text weight="semibold" className="text-xl">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body-sm" color="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </Animated.View>
  );
}

export function PublicPortfolioScreen({
  playerId,
  onBack,
  previewMode = false,
  previewData,
}: PublicPortfolioScreenProps) {
  const fetched = usePublicPortfolio(previewData || previewMode ? null : playerId);
  const ownPreview = useOwnPortfolioPreview(previewMode && !previewData);
  const data = previewData ?? ownPreview ?? fetched.data;
  const isLoading = previewData
    ? false
    : previewMode
      ? !ownPreview
      : fetched.isLoading;
  const error = previewData || previewMode ? null : fetched.error;
  const refresh = fetched.refresh;

  if (isLoading) {
    return (
      <Screen title="Portfolio" subtitle="Loading football résumé" safeArea>
        <SkeletonLoader variant="profile" />
        <SkeletonLoader variant="card" count={2} />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen title="Portfolio" subtitle="Unavailable" safeArea onRetry={refresh} error={error}>
        <EmptyState
          title={previewMode ? 'Portfolio unavailable' : 'Portfolio is private'}
          description={
            error ??
            (previewMode
              ? 'Unable to load portfolio preview.'
              : 'This player has not enabled a public portfolio yet.')
          }
          actionLabel={onBack ? 'Go back' : 'Retry'}
          onAction={onBack ?? refresh}
        />
      </Screen>
    );
  }

  const { profile, privacy, recommendations, gpsHighlights } = data;
  let sectionIndex = 0;

  return (
    <Screen
      title={previewMode ? 'Portfolio preview' : 'ScoutX Portfolio'}
      subtitle="Premium shareable football résumé"
      safeArea
      onRefresh={refresh}
      header={
        onBack ? (
          <View className="mb-2">
            <Button variant="ghost" size="sm" onPress={onBack} className="self-start">
              Back
            </Button>
          </View>
        ) : undefined
      }
    >
      <ScrollView contentContainerClassName="gap-6 pb-10" showsVerticalScrollIndicator={false}>
        <View className="overflow-hidden rounded-3xl border border-border bg-white dark:border-neutral-800 dark:bg-neutral-950">
          {profile.coverImageUrl ? (
            <Image
              source={{ uri: profile.coverImageUrl }}
              className="h-40 w-full"
              resizeMode="cover"
            />
          ) : (
            <View className="h-40 bg-accent-muted dark:bg-green-950" />
          )}
          <View className="-mt-10 px-5 pb-5">
            <Avatar
              name={profile.fullName}
              source={profile.avatarUrl ? { uri: profile.avatarUrl } : undefined}
              size="2xl"
              showBorder
            />
            <View className="mt-3 gap-2">
              <Text weight="semibold" className="text-2xl">
                {profile.fullName}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                <Badge variant="accent" label={profile.position} />
                <Badge variant="default" label={profile.club} />
                <Badge variant="info" label={profile.nationality} />
              </View>
              {profile.biography ? (
                <Text variant="body-sm" color="secondary" className="mt-2">
                  {profile.biography}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {isPortfolioSectionVisible(privacy, 'careerTimeline') && profile.footballJourney ? (
          <PortfolioSection
            title="Career Timeline"
            subtitle="Clubs, milestones, and football journey"
            index={sectionIndex++}
          >
            <FootballJourneySection entries={profile.footballJourney.entries} />
          </PortfolioSection>
        ) : null}

        {isPortfolioSectionVisible(privacy, 'statistics') ? (
          <PortfolioSection title="Statistics" subtitle="Season and match performance" index={sectionIndex++}>
            <ProfileStatsGrid stats={profile.stats} />
            <PlayerStatisticsSection matches={profile.statisticsMatches} />
          </PortfolioSection>
        ) : null}

        {isPortfolioSectionVisible(privacy, 'performanceCharts') ? (
          <PortfolioSection title="Performance Charts" subtitle="Radar and progress trends" index={sectionIndex++}>
            <PerformanceSummary items={profile.performanceSummary} />
          </PortfolioSection>
        ) : null}

        {isPortfolioSectionVisible(privacy, 'videos') && profile.highlightVideos ? (
          <PortfolioSection title="Highlight Videos" subtitle="Featured reels and clips" index={sectionIndex++}>
            <HighlightVideosSection library={profile.highlightVideos} />
          </PortfolioSection>
        ) : null}

        {isPortfolioSectionVisible(privacy, 'achievements') ? (
          <PortfolioSection title="Achievements" subtitle="Honours and standout moments" index={sectionIndex++}>
            <View className="gap-2">
              {profile.identity.careerTimeline
                .filter((entry) => entry.type === 'achievement')
                .map((entry) => (
                  <Badge key={entry.id} variant="success" label={entry.title} />
                ))}
              {profile.footballJourney?.entries
                .filter((entry) => entry.type === 'achievement')
                .map((entry) => (
                  <Text key={entry.id} variant="body-sm">
                    {entry.title}
                  </Text>
                ))}
            </View>
          </PortfolioSection>
        ) : null}

        {isPortfolioSectionVisible(privacy, 'recommendations') && recommendations.length > 0 ? (
          <PortfolioSection title="Recommendations" subtitle="Trusted endorsements" index={sectionIndex++}>
            <View className="gap-3">
              {recommendations.map((recommendation, index) => (
                <RecommendationCard key={recommendation.id} recommendation={recommendation} index={index} />
              ))}
            </View>
          </PortfolioSection>
        ) : null}

        {isPortfolioSectionVisible(privacy, 'gpsHighlights') && gpsHighlights.length > 0 ? (
          <PortfolioSection title="GPS Highlights" subtitle="Movement intelligence snapshots" index={sectionIndex++}>
            <View className="gap-4">
              {gpsHighlights.map((session) => (
                <View key={session.id} className="gap-2">
                  <Text weight="semibold">{session.matchLabel}</Text>
                  <GpsHeatmap heatmap={session.heatmap} />
                </View>
              ))}
            </View>
          </PortfolioSection>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Button } from '@/components/primitives/Button';
import { Badge } from '@/components/primitives/Badge';
import { Text } from '@/components/primitives/Text';
import { ActivityRecorder } from '@/features/activity-feed/services/activityRecorder';
import { FootballJourneySection } from '@/features/football-journey';
import { HighlightVideosSection } from '@/features/highlight-videos';
import { GpsHeatmap } from '@/features/gps/components/GpsHeatmap';
import { PerformanceSummary } from '@/features/player-profile/components/PerformanceSummary';
import { ProfileStatsGrid } from '@/features/player-profile/components/ProfileStatsGrid';
import { RecommendationCard } from '@/features/trust-system/components/RecommendationCard';
import { CoachEndorsementModal } from '@/features/trust-system/components/CoachEndorsementModal';
import { PlayerStatisticsSection } from '@/features/player-statistics';
import { FootballPassportHero } from '@/features/public-portfolio/components/FootballPassportHero';
import { PortfolioSection } from '@/features/public-portfolio/components/PortfolioSection';
import { isPortfolioSectionVisible } from '@/features/public-portfolio/models/PortfolioModel';
import { useCanWriteCoachEndorsement } from '@/features/public-portfolio/hooks/useCanWriteCoachEndorsement';
import { usePublicPortfolio } from '@/features/public-portfolio/hooks/usePublicPortfolio';
import { type PublicPortfolioData } from '@/features/public-portfolio/types';
import { PortfolioAnalyticsRepository } from '@/features/portfolio-analytics/repositories/PortfolioAnalyticsRepository';
import { PlayerDiscoveryRepository } from '@/features/scout-discovery/repositories/PlayerDiscoveryRepository';
import { usePlayerTrust } from '@/features/trust-system/hooks/usePlayerTrust';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { type AuthRole } from '@/features/auth/types';

export type PublicPortfolioScreenProps = {
  playerId: string;
  slug?: string;
  onBack?: () => void;
  previewMode?: boolean;
  previewData?: PublicPortfolioData;
  previewLoading?: boolean;
  endorseMode?: boolean;
};

function isScoutLikeRole(role: AuthRole | null | undefined): boolean {
  return role === 'scout' || role === 'coach';
}

export function PublicPortfolioScreen({
  playerId,
  slug,
  onBack,
  previewMode = false,
  previewData,
  previewLoading = false,
  endorseMode = false,
}: PublicPortfolioScreenProps) {
  const { user, role } = useAuth();
  const fetched = usePublicPortfolio(previewData || previewMode ? null : playerId);
  const data = previewData ?? fetched.data;
  const isLoading = previewData ? false : previewMode ? previewLoading : fetched.isLoading;
  const error = previewData || previewMode ? null : fetched.error;
  const refresh = fetched.refresh;

  const trust = usePlayerTrust(playerId, {
    currentClub: data?.profile.identity.currentClub ?? '',
    clubHistory: data?.profile.identity.clubHistory ?? [],
    playerName: data?.profile.fullName ?? 'Player',
  });

  const [endorsementVisible, setEndorsementVisible] = useState(false);
  const canEndorse = useCanWriteCoachEndorsement(playerId);
  const viewedRef = useRef(false);

  useEffect(() => {
    if (
      previewMode ||
      !playerId ||
      !user?.id ||
      user.id === playerId ||
      !data?.profile.fullName ||
      viewedRef.current
    ) {
      return;
    }

    viewedRef.current = true;
    const isScoutView = isScoutLikeRole(role);
    void PortfolioAnalyticsRepository.getInstance().recordPortfolioView(playerId, isScoutView);
    void PlayerDiscoveryRepository.getInstance().recordProfileView(playerId);
    ActivityRecorder.getInstance().recordPortfolioViewed({
      playerId,
      playerName: data.profile.fullName,
      viewerId: user.id,
      viewerName: user.name ?? 'Visitor',
      viewerRole: role === 'coach' ? 'coach' : role === 'scout' ? 'scout' : 'player',
      isScoutView,
    });
  }, [data?.profile.fullName, playerId, previewMode, role, user?.id, user?.name]);

  useEffect(() => {
    if (endorseMode && canEndorse && data) {
      setEndorsementVisible(true);
    }
  }, [canEndorse, data, endorseMode]);

  if (isLoading) {
    return (
      <Screen title="Football Passport" subtitle="Loading shareable résumé" safeArea>
        <SkeletonLoader variant="profile" />
        <SkeletonLoader variant="card" count={2} />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen title="Football Passport" subtitle="Unavailable" safeArea onRetry={refresh} error={error}>
        <EmptyState
          title={previewMode ? 'Portfolio unavailable' : 'Portfolio is private'}
          description={
            error ??
            (previewMode
              ? 'Unable to load portfolio preview.'
              : 'This player has not enabled a public Football Passport yet.')
          }
          actionLabel={onBack ? 'Go back' : 'Retry'}
          onAction={onBack ?? refresh}
        />
      </Screen>
    );
  }

  const { profile, privacy, recommendations, gpsHighlights } = data;
  const displayUsername = profile.username ?? slug ?? null;
  let sectionIndex = 0;

  const handleSaveEndorsement = async (
    draft: Parameters<typeof trust.saveRecommendation>[3],
  ) => {
    if (!user?.id) {
      throw new Error('You must be signed in to endorse a player.');
    }

    await trust.saveRecommendation(user.id, user.name ?? 'Coach', '', draft);
  };

  return (
    <Screen
      title={previewMode ? 'Passport preview' : 'Football Passport'}
      subtitle="ScoutX shareable football résumé"
      safeArea
      onRefresh={refresh}
      header={
        <View className="mb-2 gap-2">
          {onBack ? (
            <Button variant="ghost" size="sm" onPress={onBack} className="self-start">
              Back
            </Button>
          ) : null}
          {canEndorse ? (
            <Button variant="accent" size="sm" onPress={() => setEndorsementVisible(true)}>
              Write coach endorsement
            </Button>
          ) : null}
        </View>
      }
    >
      <ScrollView contentContainerClassName="gap-6 pb-10" showsVerticalScrollIndicator={false}>
        <FootballPassportHero data={data} username={displayUsername} />

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
          <PortfolioSection title="Coach Endorsements" subtitle="Trusted recommendations" index={sectionIndex++}>
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

      {canEndorse ? (
        <CoachEndorsementModal
          visible={endorsementVisible}
          playerName={profile.fullName}
          saving={trust.isSaving}
          onClose={() => setEndorsementVisible(false)}
          onSave={handleSaveEndorsement}
        />
      ) : null}
    </Screen>
  );
}

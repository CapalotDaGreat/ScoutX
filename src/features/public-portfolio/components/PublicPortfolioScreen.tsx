import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { PreviewList } from '@/components/layout/PreviewList';
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
import { CoachEndorsementPrompt } from '@/features/public-portfolio/components/CoachEndorsementPrompt';
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
import { TrustSafetyActions } from '@/features/trust-safety/components/TrustSafetyActions';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { isGuestRole } from '@/features/auth/services/authAccess';
import { type AuthRole } from '@/features/auth/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type PublicPortfolioScreenProps = {
  playerId: string;
  slug?: string;
  onBack?: () => void;
  previewMode?: boolean;
  previewData?: PublicPortfolioData;
  previewLoading?: boolean;
  endorseMode?: boolean;
  onSignInForEndorsement?: () => void;
  onRegisterForEndorsement?: () => void;
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
  onSignInForEndorsement,
  onRegisterForEndorsement,
}: PublicPortfolioScreenProps) {
  const { t } = useAppTranslation(['portfolio', 'common', 'errors', 'passport']);
  const { user, role } = useAuth();
  const fetched = usePublicPortfolio(previewData || previewMode ? null : playerId);
  const data = previewData ?? fetched.data;
  const isLoading = previewData ? false : previewMode ? previewLoading : fetched.isLoading;
  const error = previewData || previewMode ? null : fetched.error;
  const refresh = fetched.refresh;

  const trust = usePlayerTrust(playerId, {
    currentClub: data?.profile.identity.currentClub ?? '',
    clubHistory: data?.profile.identity.clubHistory ?? [],
    playerName: data?.profile.fullName ?? t('portfolio:defaultPlayerName'),
  });

  const [endorsementVisible, setEndorsementVisible] = useState(false);
  const canEndorse = useCanWriteCoachEndorsement(playerId);
  const isGuest = isGuestRole(role ?? undefined, user?.isAnonymous);
  const isPlayerAccount = role === 'player' && user?.id !== playerId;
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
      viewerName: user.name ?? t('portfolio:defaultVisitorName'),
      viewerRole: role === 'coach' ? 'coach' : role === 'scout' ? 'scout' : 'player',
      isScoutView,
    });
  }, [data?.profile.fullName, playerId, previewMode, role, t, user?.id, user?.name]);

  useEffect(() => {
    if (endorseMode && canEndorse && data) {
      setEndorsementVisible(true);
    }
  }, [canEndorse, data, endorseMode]);

  if (isLoading) {
    return (
      <Screen title={t('portfolio:footballPassport')} subtitle={t('portfolio:loadingPassportSubtitle')} safeArea>
        <SkeletonLoader variant="profile" />
        <SkeletonLoader variant="card" count={2} />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen
        title={t('portfolio:footballPassport')}
        subtitle={t('portfolio:passportUnavailable')}
        safeArea
        onRetry={refresh}
        error={error}
      >
        <EmptyState
          title={previewMode ? t('portfolio:unavailableTitle') : t('portfolio:privatePortfolioTitle')}
          description={
            error ??
            (previewMode
              ? t('portfolio:previewUnavailableDescription')
              : t('portfolio:privatePortfolioDescription'))
          }
          actionLabel={onBack ? t('portfolio:goBack') : t('common:retry')}
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
      throw new Error(t('errors:endorseSignInRequired'));
    }

    await trust.saveRecommendation(user.id, user.name ?? t('portfolio:defaultCoachName'), '', draft);
  };

  return (
    <Screen
      title={previewMode ? t('portfolio:passportPreview') : t('portfolio:footballPassport')}
      subtitle={t('portfolio:passportSubtitle')}
      safeArea
      onRefresh={refresh}
      header={
        <View className="mb-2 gap-2">
          {onBack ? (
            <Button variant="ghost" size="sm" onPress={onBack} className="self-start">
              {t('common:back')}
            </Button>
          ) : null}
          <View className="flex-row flex-wrap items-center gap-2">
            {canEndorse ? (
              <Button variant="accent" size="sm" onPress={() => setEndorsementVisible(true)}>
                {t('portfolio:writeCoachEndorsement')}
              </Button>
            ) : null}
            {!previewMode ? (
              <TrustSafetyActions targetUserId={playerId} targetUserName={profile.fullName} />
            ) : null}
          </View>
        </View>
      }
    >
      <ScrollView contentContainerClassName="gap-6 pb-10" showsVerticalScrollIndicator={false}>
        {endorseMode && !canEndorse ? (
          <CoachEndorsementPrompt
            playerName={profile.fullName}
            isGuest={isGuest}
            isPlayerAccount={isPlayerAccount}
            onSignInPress={onSignInForEndorsement}
            onRegisterPress={onRegisterForEndorsement}
          />
        ) : null}

        <FootballPassportHero
          data={data}
          username={displayUsername}
          verification={trust.isLoading ? undefined : (trust.trustProfile?.player ?? null)}
        />
        <Text variant="caption" color="tertiary">
          {t('passport:scoutPreview.note')}
        </Text>

        {isPortfolioSectionVisible(privacy, 'statistics') ? (
          <PortfolioSection
            title={t('portfolio:sections.statistics.title')}
            subtitle={t('portfolio:sections.statistics.subtitle')}
            index={sectionIndex++}
          >
            <View className="gap-5">
              <ProfileStatsGrid stats={profile.stats} compact />
              <CollapsibleSection
                title={t('portfolio:publicUi.fullPerformance')}
                subtitle={t('portfolio:publicUi.fullPerformanceSubtitle')}
                persistKey={`public-stats-${playerId}`}
              >
                <ProfileStatsGrid stats={profile.stats} />
                <PlayerStatisticsSection matches={profile.statisticsMatches} />
              </CollapsibleSection>
            </View>
          </PortfolioSection>
        ) : null}

        {isPortfolioSectionVisible(privacy, 'careerTimeline') && profile.footballJourney ? (
          <PortfolioSection
            title={t('portfolio:sections.careerTimeline.title')}
            subtitle={t('portfolio:sections.careerTimeline.subtitle')}
            index={sectionIndex++}
          >
            <CollapsibleSection
              title={t('portfolio:publicUi.timeline')}
              subtitle={t('portfolio:publicUi.moments', { count: profile.footballJourney.entries.length })}
              defaultOpen
              persistKey={`public-timeline-${playerId}`}
            >
              <FootballJourneySection entries={profile.footballJourney.entries.slice(0, 5)} />
              {profile.footballJourney.entries.length > 5 ? (
                <CollapsibleSection
                  title={t('portfolio:publicUi.fullTimeline')}
                  subtitle={t('portfolio:publicUi.moreMoments', { count: profile.footballJourney.entries.length - 5 })}
                  persistKey={`public-timeline-full-${playerId}`}
                >
                  <FootballJourneySection entries={profile.footballJourney.entries} />
                </CollapsibleSection>
              ) : null}
            </CollapsibleSection>
          </PortfolioSection>
        ) : null}

        {isPortfolioSectionVisible(privacy, 'performanceCharts') ? (
          <PortfolioSection
            title={t('portfolio:sections.performanceCharts.title')}
            subtitle={t('portfolio:sections.performanceCharts.subtitle')}
            index={sectionIndex++}
          >
            <CollapsibleSection
              title={t('portfolio:publicUi.charts')}
              subtitle={t('portfolio:publicUi.chartsSubtitle')}
              persistKey={`public-charts-${playerId}`}
            >
              <PerformanceSummary items={profile.performanceSummary} />
            </CollapsibleSection>
          </PortfolioSection>
        ) : null}

        {isPortfolioSectionVisible(privacy, 'videos') && profile.highlightVideos ? (
          <PortfolioSection
            title={t('portfolio:sections.videos.title')}
            subtitle={t('portfolio:sections.videos.subtitle')}
            index={sectionIndex++}
          >
            <CollapsibleSection
              title={t('portfolio:publicUi.videos')}
              subtitle={t('portfolio:publicUi.videosSubtitle')}
              defaultOpen
              persistKey={`public-videos-${playerId}`}
            >
              <HighlightVideosSection library={profile.highlightVideos} />
            </CollapsibleSection>
          </PortfolioSection>
        ) : null}

        {isPortfolioSectionVisible(privacy, 'achievements') ? (
          <PortfolioSection
            title={t('portfolio:sections.achievements.title')}
            subtitle={t('portfolio:sections.achievements.subtitle')}
            index={sectionIndex++}
          >
            <View className="gap-2">
              {profile.identity.careerTimeline
                .filter((entry) => entry.type === 'achievement')
                .slice(0, 6)
                .map((entry) => (
                  <Badge key={entry.id} variant="prestige" label={entry.title} />
                ))}
              {profile.footballJourney?.entries
                .filter((entry) => entry.type === 'achievement')
                .slice(0, 6)
                .map((entry) => (
                  <Text key={entry.id} variant="body-sm">
                    {entry.title}
                  </Text>
                ))}
            </View>
          </PortfolioSection>
        ) : null}

        {isPortfolioSectionVisible(privacy, 'recommendations') && recommendations.length > 0 ? (
          <PortfolioSection
            title={t('portfolio:sections.recommendations.title')}
            subtitle={t('portfolio:sections.recommendations.subtitle')}
            index={sectionIndex++}
          >
            <PreviewList
              items={recommendations}
              previewCount={3}
              keyExtractor={(recommendation) => recommendation.id}
              renderItem={(recommendation, index) => (
                <RecommendationCard recommendation={recommendation} index={index} />
              )}
            />
          </PortfolioSection>
        ) : null}

        {isPortfolioSectionVisible(privacy, 'gpsHighlights') && gpsHighlights.length > 0 ? (
          <PortfolioSection
            title={t('portfolio:sections.gpsHighlights.title')}
            subtitle={t('portfolio:sections.gpsHighlights.subtitle')}
            index={sectionIndex++}
          >
            <CollapsibleSection
              title={t('portfolio:publicUi.gps')}
              subtitle={t('portfolio:publicUi.sessions', { count: gpsHighlights.length })}
              defaultOpen
              persistKey={`public-gps-${playerId}`}
            >
              <View className="gap-4">
                {gpsHighlights.slice(0, 1).map((session) => (
                  <View key={session.id} className="gap-2">
                    <Text weight="semibold">{session.matchLabel}</Text>
                    <GpsHeatmap heatmap={session.heatmap} />
                  </View>
                ))}
                {gpsHighlights.length > 1 ? (
                  <CollapsibleSection
                    title={t('portfolio:publicUi.moreSessions')}
                    subtitle={t('portfolio:publicUi.additional', { count: gpsHighlights.length - 1 })}
                    persistKey={`public-gps-more-${playerId}`}
                  >
                    <View className="gap-4">
                      {gpsHighlights.slice(1).map((session) => (
                        <View key={session.id} className="gap-2">
                          <Text weight="semibold">{session.matchLabel}</Text>
                          <GpsHeatmap heatmap={session.heatmap} />
                        </View>
                      ))}
                    </View>
                  </CollapsibleSection>
                ) : null}
              </View>
            </CollapsibleSection>
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

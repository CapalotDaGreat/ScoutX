import { useMemo } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Button } from '@/components/primitives/Button';
import { HomePerformanceOverview } from '@/features/player-profile/components/HomePerformanceOverview';
import { PerformanceSummary } from '@/features/player-profile/components/PerformanceSummary';
import { ProfileDetails } from '@/features/player-profile/components/ProfileDetails';
import { ProfileHero } from '@/features/player-profile/components/ProfileHero';
import { ProfileStatsGrid } from '@/features/player-profile/components/ProfileStatsGrid';
import { BiographyIdentitySection } from '@/features/player-profile/components/identity/BiographyIdentitySection';
import { CareerIdentitySection } from '@/features/player-profile/components/identity/CareerIdentitySection';
import { PersonalIdentitySection } from '@/features/player-profile/components/identity/PersonalIdentitySection';
import { PlayingIdentitySection } from '@/features/player-profile/components/identity/PlayingIdentitySection';
import { ProfessionalIdentitySection } from '@/features/player-profile/components/identity/ProfessionalIdentitySection';
import { type PlayerProfile } from '@/features/player-profile/types';
import { mapMatchesToHomeQuickStats } from '@/features/player-statistics/utils/profileStatsMapper';
import { FootballJourneySection, useFootballJourney } from '@/features/football-journey';
import { HighlightVideosSection } from '@/features/highlight-videos';
import { ActivityBellButton, ActivityFeedSection, useActivities } from '@/features/activity-feed';
import { AdminReviewCard } from '@/features/admin-review/components/AdminReviewCard';
import { isAdminUser } from '@/config/admin';
import { useAuth } from '@/features/auth/store/AuthProvider';
import {
  FootballPassportScoreCard,
  PortfolioPrivacySettings,
  UsernameClaimField,
} from '@/features/public-portfolio';
import { PortfolioAnalyticsCard } from '@/features/portfolio-analytics/components/PortfolioAnalyticsCard';
import { PlayerOnboardingCard } from '@/features/player-onboarding/components/PlayerOnboardingCard';
import { type PlayerOnboardingReport } from '@/features/player-onboarding/types';
import { PlayerVerificationCard } from '@/features/verification-system/components/PlayerVerificationCard';
import { defaultPrivacySettings } from '@/features/player-profile/types/privacySettings';
import { TrustProfileSection, type UsePlayerTrustResult } from '@/features/trust-system';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type PlayerProfileScreenProps = {
  profile: PlayerProfile | null;
  loading?: boolean;
  error?: string | null;
  trustState: UsePlayerTrustResult;
  onRetry?: () => void;
  onEditPress?: () => void;
  onEditJourneyPress?: () => void;
  onManageVideosPress?: () => void;
  onLogMatchPress?: () => void;
  onActivityPress?: () => void;
  onPortfolioPress?: () => void;
  onSharePortfolioPress?: () => void;
  onInviteCoachPress?: () => void;
  onExportCvPress?: () => void;
  onboardingReport?: PlayerOnboardingReport | null;
  onOnboardingStepPress?: (stepId: PlayerOnboardingReport['steps'][number]['id']) => void;
  onDismissOnboarding?: () => void;
  onUsernameClaimed?: (username: string) => Promise<void>;
  onPrivacyChange?: (privacy: PlayerProfile['privacy']) => Promise<void>;
  onSettingsPress?: () => void;
  onSignOut?: () => void;
  embeddedInTabShell?: boolean;
};

export function PlayerProfileScreen({
  profile,
  loading = false,
  error = null,
  trustState,
  onRetry,
  onEditPress,
  onEditJourneyPress,
  onManageVideosPress,
  onLogMatchPress,
  onActivityPress,
  onPortfolioPress,
  onSharePortfolioPress,
  onInviteCoachPress,
  onExportCvPress,
  onboardingReport,
  onOnboardingStepPress,
  onDismissOnboarding,
  onUsernameClaimed,
  onPrivacyChange,
  onSettingsPress,
  onSignOut,
  embeddedInTabShell = false,
}: PlayerProfileScreenProps) {
  const { t } = useAppTranslation(['portfolio', 'common', 'settings', 'auth']);
  const { user } = useAuth();
  const { trustProfile, recommendations, ...trustStateRest } = trustState;
  const { entries: journeyEntries } = useFootballJourney(profile);
  const { unreadCount } = useActivities();

  const homeQuickStats = useMemo(
    () => mapMatchesToHomeQuickStats(profile?.statisticsMatches ?? []),
    [profile?.statisticsMatches],
  );

  const screenProps = embeddedInTabShell ? { embeddedInTabShell: true as const } : {};

  if (loading) {
    return (
      <Screen
        title={embeddedInTabShell ? t('portfolio:homeTitle') : t('portfolio:title')}
        subtitle={t('portfolio:loadingSubtitle')}
        safeArea
        {...screenProps}
      >
        <View className="gap-4 rounded-xl bg-surface p-4">
          <SkeletonLoader variant="profile" />
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen
        title={embeddedInTabShell ? t('portfolio:homeTitle') : t('portfolio:title')}
        subtitle={t('portfolio:errorSubtitle')}
        safeArea
        {...screenProps}
      >
        <EmptyState
          title={t('portfolio:unavailableTitle')}
          description={error}
          actionLabel={t('common:retry')}
          onAction={onRetry}
        />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen
        title={embeddedInTabShell ? t('portfolio:homeTitle') : t('portfolio:title')}
        subtitle={t('portfolio:emptySubtitle')}
        safeArea
        {...screenProps}
      >
        <EmptyState
          title={t('portfolio:buildTitle')}
          description={t('portfolio:buildDescription')}
          actionLabel={t('common:refresh')}
          onAction={onRetry}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title={embeddedInTabShell ? t('portfolio:homeTitle') : t('portfolio:title')}
      subtitle={embeddedInTabShell ? t('portfolio:homeSubtitle') : t('portfolio:subtitle')}
      safeArea
      {...screenProps}
      header={
        onActivityPress || onSettingsPress ? (
          <View className="mb-2 flex-row items-center justify-end gap-2">
            {onActivityPress ? (
              <ActivityBellButton unreadCount={unreadCount} onPress={onActivityPress} />
            ) : null}
            {onSettingsPress ? (
              <Button variant="secondary" size="sm" onPress={onSettingsPress}>
                {t('common:settings')}
              </Button>
            ) : null}
          </View>
        ) : undefined
      }
    >
      <View className="gap-4">
        {/* First viewport: who am I / how am I doing */}
        <ProfileHero profile={profile} trustProfile={trustProfile} onEditPress={onEditPress} />
        <ProfileStatsGrid stats={homeQuickStats} compact />
        <HomePerformanceOverview
          matches={profile.statisticsMatches}
          onLogMatchPress={onLogMatchPress}
        />

        {onboardingReport && onOnboardingStepPress && onDismissOnboarding ? (
          <PlayerOnboardingCard
            steps={onboardingReport.steps}
            completedCount={onboardingReport.completedCount}
            totalCount={onboardingReport.totalCount}
            onStepPress={onOnboardingStepPress}
            onDismiss={onDismissOnboarding}
          />
        ) : null}

        {onActivityPress ? <ActivityFeedSection onViewAllPress={onActivityPress} limit={3} /> : null}

        {/* Below-fold: passport, identity, trust */}
        <FootballPassportScoreCard
          playerId={profile.id}
          profile={profile}
          recommendations={recommendations}
        />

        <CollapsibleSection
          title={t('portfolio:passportInsights')}
          subtitle={t('portfolio:passportInsightsSubtitle')}
        >
          <View className="gap-3">
            <PortfolioAnalyticsCard playerId={profile.id} profile={profile} />
            <PlayerVerificationCard playerId={profile.id} playerName={profile.fullName} />
          </View>
        </CollapsibleSection>

        {isAdminUser(user?.uid) ? <AdminReviewCard /> : null}

        <CollapsibleSection
          title={t('portfolio:publicPassport')}
          subtitle={t('portfolio:publicPassportSubtitle')}
        >
          <View className="gap-3">
            {onUsernameClaimed ? (
              <UsernameClaimField
                playerId={profile.id}
                fullName={profile.fullName}
                username={profile.username}
                onClaimed={onUsernameClaimed}
              />
            ) : null}
            <PortfolioPrivacySettings
              settings={profile.privacy ?? defaultPrivacySettings()}
              onChange={(next) => {
                if (onPrivacyChange) {
                  void onPrivacyChange(next);
                }
              }}
            />
            <View className="flex-row flex-wrap gap-2">
              {onPortfolioPress ? (
                <Button variant="secondary" onPress={onPortfolioPress}>
                  {t('portfolio:previewPassport')}
                </Button>
              ) : null}
              {onSharePortfolioPress ? (
                <Button variant="accent" onPress={onSharePortfolioPress}>
                  {t('portfolio:sharePassport')}
                </Button>
              ) : null}
              {onInviteCoachPress ? (
                <Button variant="secondary" onPress={onInviteCoachPress}>
                  {t('portfolio:inviteCoach')}
                </Button>
              ) : null}
              {onExportCvPress ? (
                <Button variant="secondary" onPress={onExportCvPress}>
                  {t('portfolio:exportCv')}
                </Button>
              ) : null}
            </View>
          </View>
        </CollapsibleSection>

        <TrustProfileSection
          playerId={profile.id}
          playerName={profile.fullName}
          currentClub={profile.identity.currentClub}
          clubHistory={profile.identity.clubHistory}
          trustState={{ trustProfile, recommendations, ...trustStateRest }}
          onInviteCoachPress={onInviteCoachPress}
        />

        <CollapsibleSection
          title={t('portfolio:storyMedia')}
          subtitle={t('portfolio:storyMediaSubtitle')}
        >
          <BiographyIdentitySection identity={profile.identity} biography={profile.biography} />
          <FootballJourneySection
            entries={journeyEntries}
            editable={Boolean(onEditJourneyPress)}
            onEditPress={onEditJourneyPress}
          />
          <HighlightVideosSection
            library={profile.highlightVideos}
            editable={Boolean(onManageVideosPress)}
            onManagePress={onManageVideosPress}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title={t('portfolio:playerProfile')}
          subtitle={t('portfolio:playerProfileSubtitle')}
        >
          <PlayingIdentitySection identity={profile.identity} />
          <PersonalIdentitySection identity={profile.identity} />
          <CareerIdentitySection identity={profile.identity} />
          <ProfessionalIdentitySection identity={profile.identity} />
          <ProfileDetails profile={profile} />
        </CollapsibleSection>

        <CollapsibleSection
          title={t('portfolio:performanceSnapshot')}
          subtitle={t('portfolio:performanceSnapshotSubtitle')}
        >
          <ProfileStatsGrid stats={profile.stats} />
          <PerformanceSummary items={profile.performanceSummary} />
        </CollapsibleSection>

        <Button variant="secondary" onPress={onEditPress}>
          {t('portfolio:editProfile')}
        </Button>
        {onSettingsPress ? (
          <Button variant="ghost" onPress={onSettingsPress}>
            {t('settings:title')}
          </Button>
        ) : onSignOut ? (
          <Button variant="ghost" onPress={onSignOut}>
            {t('auth:signOut')}
          </Button>
        ) : null}
      </View>
    </Screen>
  );
}

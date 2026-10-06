/**
 * Player Home — slimmed IA:
 * hero, passport score, onboarding, quick stats/activity, trust,
 * passport CTAs (no privacy editor), identity entry, Settings footer.
 */
import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { HeaderActionCluster, HeaderIconButton } from '@/components/navigation/HeaderIconButton';
import { HomePerformanceOverview } from '@/features/player-profile/components/HomePerformanceOverview';
import { ProfileHero } from '@/features/player-profile/components/ProfileHero';
import { ProfileStatsGrid } from '@/features/player-profile/components/ProfileStatsGrid';
import { BiographyIdentitySection } from '@/features/player-profile/components/identity/BiographyIdentitySection';
import { CareerIdentitySection } from '@/features/player-profile/components/identity/CareerIdentitySection';
import { PersonalIdentitySection } from '@/features/player-profile/components/identity/PersonalIdentitySection';
import { PlayingIdentitySection } from '@/features/player-profile/components/identity/PlayingIdentitySection';
import { ProfessionalIdentitySection } from '@/features/player-profile/components/identity/ProfessionalIdentitySection';
import { ProfileDetails } from '@/features/player-profile/components/ProfileDetails';
import { type PlayerProfile } from '@/features/player-profile/types';
import { mapMatchesToHomeQuickStats } from '@/features/player-statistics/utils/profileStatsMapper';
import { ActivityBellButton, ActivityFeedSection, useActivities } from '@/features/activity-feed';
import { AdminReviewCard } from '@/features/admin-review/components/AdminReviewCard';
import { isAdminUser } from '@/config/admin';
import { useAuth } from '@/features/auth/store/AuthProvider';
import {
  FootballPassportScoreCard,
  UsernameClaimField,
} from '@/features/public-portfolio';
import { PortfolioAnalyticsCard } from '@/features/portfolio-analytics/components/PortfolioAnalyticsCard';
import { PlayerOnboardingCard } from '@/features/player-onboarding/components/PlayerOnboardingCard';
import { type PlayerOnboardingReport } from '@/features/player-onboarding/types';
import { PlayerVerificationCard } from '@/features/verification-system/components/PlayerVerificationCard';
import { TrustProfileSection, type UsePlayerTrustResult } from '@/features/trust-system';
import { HomeTrialsQuickAction } from '@/features/trial-invitations/components/HomeTrialsQuickAction';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type PlayerProfileScreenProps = {
  profile: PlayerProfile | null;
  loading?: boolean;
  error?: string | null;
  trustState: UsePlayerTrustResult;
  onRetry?: () => void;
  onEditPress?: () => void;
  onLogMatchPress?: () => void;
  onViewPerformancePress?: () => void;
  onActivityPress?: () => void;
  onPortfolioPress?: () => void;
  onSharePortfolioPress?: () => void;
  onInviteCoachPress?: () => void;
  onExportCvPress?: () => void;
  onTrialsPress?: () => void;
  pendingTrialsCount?: number;
  onboardingReport?: PlayerOnboardingReport | null;
  onOnboardingStepPress?: (stepId: PlayerOnboardingReport['steps'][number]['id']) => void;
  onDismissOnboarding?: () => void;
  onUsernameClaimed?: (username: string) => Promise<void>;
  /** Bumps when onboarding asks the player to finish passport link/username. */
  passportSettingsFocusKey?: number | null;
  onSettingsPress?: () => void;
  embeddedInTabShell?: boolean;
  /** Today section (next best action, continue, snapshots) rendered directly under the hero. */
  todaySlot?: ReactNode;
};

export function PlayerProfileScreen({
  profile,
  loading = false,
  error = null,
  trustState,
  onRetry,
  onEditPress,
  onLogMatchPress,
  onViewPerformancePress,
  onActivityPress,
  onPortfolioPress,
  onSharePortfolioPress,
  onInviteCoachPress,
  onExportCvPress,
  onTrialsPress,
  pendingTrialsCount = 0,
  onboardingReport,
  onOnboardingStepPress,
  onDismissOnboarding,
  onUsernameClaimed,
  passportSettingsFocusKey = null,
  onSettingsPress,
  embeddedInTabShell = false,
  todaySlot,
}: PlayerProfileScreenProps) {
  const { t } = useAppTranslation(['portfolio', 'common', 'settings']);
  const { user } = useAuth();
  const { trustProfile, recommendations, ...trustStateRest } = trustState;
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
      headerActions={
        onActivityPress || onSettingsPress ? (
          <HeaderActionCluster>
            {onActivityPress ? (
              <ActivityBellButton unreadCount={unreadCount} onPress={onActivityPress} />
            ) : null}
            {onSettingsPress ? (
              <HeaderIconButton
                accessibilityLabel={t('common:settings')}
                onPress={onSettingsPress}
              />
            ) : null}
          </HeaderActionCluster>
        ) : undefined
      }
    >
      <View className="gap-6">
        <ProfileHero profile={profile} trustProfile={trustProfile} onEditPress={onEditPress} />

        {todaySlot}

        <HomePerformanceOverview
          matches={profile.statisticsMatches}
          onLogMatchPress={onLogMatchPress}
          onViewAllMatchesPress={onViewPerformancePress}
        />

        <FootballPassportScoreCard
          playerId={profile.id}
          profile={profile}
          recommendations={recommendations}
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

        <ProfileStatsGrid stats={homeQuickStats} compact />

        {onActivityPress ? <ActivityFeedSection onViewAllPress={onActivityPress} limit={3} /> : null}

        {onTrialsPress ? (
          <HomeTrialsQuickAction pendingCount={pendingTrialsCount} onPress={onTrialsPress} />
        ) : null}

        <CollapsibleSection
          title={t('portfolio:passportInsights')}
          subtitle={t('portfolio:passportInsightsSubtitle')}
          persistKey="home-passport-insights"
        >
          <View className="gap-4">
            <PortfolioAnalyticsCard playerId={profile.id} />
            <PlayerVerificationCard playerId={profile.id} playerName={profile.fullName} />
          </View>
        </CollapsibleSection>

        {isAdminUser(user?.uid) ? <AdminReviewCard /> : null}

        <CollapsibleSection
          title={t('portfolio:publicPassport')}
          subtitle={t('portfolio:publicPassportSubtitle')}
          defaultOpen={!profile.username}
          forceOpenKey={passportSettingsFocusKey}
          persistKey="home-public-passport"
        >
          <View className="gap-4">
            {onUsernameClaimed ? (
              <UsernameClaimField
                playerId={profile.id}
                fullName={profile.fullName}
                username={profile.username}
                onClaimed={onUsernameClaimed}
              />
            ) : null}
            <Text variant="caption" color="secondary">
              {t('portfolio:privacyManagedInSettings')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {onPortfolioPress ? (
                <Button variant="secondary" onPress={onPortfolioPress}>
                  {t('portfolio:previewPassport')}
                </Button>
              ) : null}
              {onSharePortfolioPress ? (
                <Button variant="prestige" onPress={onSharePortfolioPress}>
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
              {onSettingsPress ? (
                <Button variant="ghost" onPress={onSettingsPress}>
                  {t('portfolio:managePrivacy')}
                </Button>
              ) : null}
            </View>
          </View>
        </CollapsibleSection>

        <CollapsibleSection
          title="Trust & endorsements"
          subtitle="Verification and coach recommendations"
          persistKey="home-trust"
        >
          <TrustProfileSection
            playerId={profile.id}
            playerName={profile.fullName}
            currentClub={profile.identity.currentClub}
            clubHistory={profile.identity.clubHistory}
            trustState={{ trustProfile, recommendations, ...trustStateRest }}
            onInviteCoachPress={onInviteCoachPress}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title={t('portfolio:playerProfile')}
          subtitle={t('portfolio:playerProfileSubtitle')}
          persistKey="home-player-profile"
        >
          <BiographyIdentitySection identity={profile.identity} biography={profile.biography} />
          <PlayingIdentitySection identity={profile.identity} />
          <PersonalIdentitySection identity={profile.identity} />
          <CareerIdentitySection identity={profile.identity} />
          <ProfessionalIdentitySection identity={profile.identity} />
          <ProfileDetails profile={profile} />
          {onEditPress ? (
            <Button variant="secondary" onPress={onEditPress}>
              {t('portfolio:editProfile')}
            </Button>
          ) : null}
        </CollapsibleSection>

        {onSettingsPress ? (
          <Button variant="ghost" onPress={onSettingsPress}>
            {t('settings:title')}
          </Button>
        ) : null}
      </View>
    </Screen>
  );
}

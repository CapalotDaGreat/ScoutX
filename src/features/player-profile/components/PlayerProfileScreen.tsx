import { View } from 'react-native';import { Screen } from '@/components/layout/Screen';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Button } from '@/components/primitives/Button';
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
import { PlayerStatisticsSection } from '@/features/player-statistics';
import { FootballJourneySection, useFootballJourney } from '@/features/football-journey';
import { HighlightVideosSection } from '@/features/highlight-videos';
import { ActivityBellButton, ActivityFeedSection, useActivities } from '@/features/activity-feed';
import { AdminReviewCard } from '@/features/admin-review/components/AdminReviewCard';
import { isAdminUser } from '@/config/admin';
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
  const { trustProfile, recommendations, ...trustStateRest } = trustState;
  const { entries: journeyEntries } = useFootballJourney(profile);
  const { unreadCount } = useActivities();

  const screenProps = embeddedInTabShell ? { embeddedInTabShell: true as const } : {};

  if (loading) {
    return (
      <Screen title="Portfolio" subtitle="Preparing your Football Passport" safeArea {...screenProps}>
        <SkeletonLoader variant="profile" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Portfolio" subtitle="We couldn’t load your portfolio" safeArea {...screenProps}>
        <EmptyState
          title="Portfolio unavailable"
          description={error}
          actionLabel="Try again"
          onAction={onRetry}
        />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen title="Portfolio" subtitle="No portfolio data available" safeArea {...screenProps}>
        <EmptyState
          title="Build your Football Passport"
          description="Add your story, stats, and videos so scouts can discover the real you."
          actionLabel="Refresh"
          onAction={onRetry}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title="Portfolio"
      subtitle="Your Football Passport on ScoutX"
      safeArea
      {...screenProps}
      header={
        onActivityPress ? (
          <View className="mb-2 flex-row justify-end">
            <ActivityBellButton unreadCount={unreadCount} onPress={onActivityPress} />
          </View>
        ) : undefined
      }
    >
      <View className="gap-4">
        <ProfileHero profile={profile} trustProfile={trustProfile} onEditPress={onEditPress} />
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

        <FootballPassportScoreCard
          playerId={profile.id}
          profile={profile}
          recommendations={recommendations}
        />

        <CollapsibleSection
          title="Passport insights"
          subtitle="Scout views and verification status"
        >
          <View className="gap-3">
            <PortfolioAnalyticsCard playerId={profile.id} profile={profile} />
            <PlayerVerificationCard playerId={profile.id} playerName={profile.fullName} />
          </View>
        </CollapsibleSection>

        {isAdminUser(profile.id) ? <AdminReviewCard /> : null}

        <CollapsibleSection
          title="Public Football Passport"
          subtitle="Shareable link, username, and privacy controls"
          defaultOpen
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
                  Preview passport
                </Button>
              ) : null}
              {onSharePortfolioPress ? (
                <Button variant="accent" onPress={onSharePortfolioPress}>
                  Share passport
                </Button>
              ) : null}
              {onInviteCoachPress ? (
                <Button variant="secondary" onPress={onInviteCoachPress}>
                  Invite coach
                </Button>
              ) : null}
              {onExportCvPress ? (
                <Button variant="secondary" onPress={onExportCvPress}>
                  Export Football CV
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
          title="Story & Media"
          subtitle="Biography, journey, and highlight videos"
          defaultOpen
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
          title="Player Profile"
          subtitle="Positions, career path, and professional details"
        >
          <PlayingIdentitySection identity={profile.identity} />
          <PersonalIdentitySection identity={profile.identity} />
          <CareerIdentitySection identity={profile.identity} />
          <ProfessionalIdentitySection identity={profile.identity} />
          <ProfileDetails profile={profile} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Performance Snapshot"
          subtitle="Stats, match logs, and performance summary"
        >
          <ProfileStatsGrid stats={profile.stats} />
          <PlayerStatisticsSection
            matches={profile.statisticsMatches}
            onLogMatchPress={onLogMatchPress}
          />
          <PerformanceSummary items={profile.performanceSummary} />
        </CollapsibleSection>

        <Button variant="secondary" onPress={onEditPress}>
          Edit profile
        </Button>
        {onSettingsPress ? (
          <Button variant="ghost" onPress={onSettingsPress}>
            Settings
          </Button>
        ) : onSignOut ? (
          <Button variant="ghost" onPress={onSignOut}>
            Sign out
          </Button>
        ) : null}
      </View>
    </Screen>
  );
}

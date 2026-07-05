import { View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Button } from '@/components/primitives/Button';
import { usePlayerProfile } from '@/features/player-profile/hooks/usePlayerProfile';
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
import {
  FootballJourneySection,
  useFootballJourney,
} from '@/features/football-journey';
import { HighlightVideosSection } from '@/features/highlight-videos';
import { ActivityBellButton, ActivityFeedSection, useActivities } from '@/features/activity-feed';
import { TrustProfileSection, usePlayerTrust } from '@/features/trust-system';

export type PlayerProfileScreenProps = {
  profile?: PlayerProfile | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onEditPress?: () => void;
  onEditJourneyPress?: () => void;
  onManageVideosPress?: () => void;
  onLogMatchPress?: () => void;
  onActivityPress?: () => void;
  onSignOut?: () => void;
  embeddedInTabShell?: boolean;
};

export function PlayerProfileScreen({
  profile: controlledProfile,
  loading: controlledLoading,
  error: controlledError,
  onRetry,
  onEditPress,
  onEditJourneyPress,
  onManageVideosPress,
  onLogMatchPress,
  onActivityPress,
  onSignOut,
  embeddedInTabShell = false,
}: PlayerProfileScreenProps) {
  const { profile, isLoading, error } = usePlayerProfile();
  const resolvedProfile = controlledProfile ?? profile;
  const resolvedLoading = controlledLoading ?? isLoading;
  const resolvedError = controlledError ?? error;
  const { entries: journeyEntries } = useFootballJourney(resolvedProfile);
  const { trustProfile, ...trustState } = usePlayerTrust(resolvedProfile?.id ?? '', {
    currentClub: resolvedProfile?.identity.currentClub,
    clubHistory: resolvedProfile?.identity.clubHistory ?? [],
    playerName: resolvedProfile?.fullName ?? 'Player',
  });

  const { unreadCount } = useActivities();

  const screenProps = embeddedInTabShell ? { embeddedInTabShell: true as const } : {};

  if (resolvedLoading) {
    return (
      <Screen title="Player Profile" subtitle="Preparing your profile snapshot" safeArea {...screenProps}>
        <SkeletonLoader variant="profile" />
      </Screen>
    );
  }

  if (resolvedError) {
    return (
      <Screen title="Player Profile" subtitle="We couldn’t fetch your profile" safeArea {...screenProps}>
        <EmptyState
          title="Profile unavailable"
          description={resolvedError}
          actionLabel="Try again"
          onAction={onRetry}
        />
      </Screen>
    );
  }

  if (!resolvedProfile) {
    return (
      <Screen title="Player Profile" subtitle="No profile data available" safeArea {...screenProps}>
        <EmptyState
          title="No player profile yet"
          description="A profile will appear here once data is available."
          actionLabel="Refresh"
          onAction={onRetry}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title="Player Profile"
      subtitle="Your football identity on ScoutX"
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
        <ProfileHero
          profile={resolvedProfile}
          trustProfile={trustProfile}
          onEditPress={onEditPress}
        />
        {onActivityPress ? <ActivityFeedSection onViewAllPress={onActivityPress} limit={3} /> : null}
        <TrustProfileSection
          playerId={resolvedProfile.id}
          playerName={resolvedProfile.fullName}
          currentClub={resolvedProfile.identity.currentClub}
          clubHistory={resolvedProfile.identity.clubHistory}
          trustState={{ trustProfile, ...trustState }}
        />

        <CollapsibleSection
          title="Story & Media"
          subtitle="Biography, journey, and highlight videos"
          defaultOpen
        >
          <BiographyIdentitySection
            identity={resolvedProfile.identity}
            biography={resolvedProfile.biography}
          />
          <FootballJourneySection
            entries={journeyEntries}
            editable={Boolean(onEditJourneyPress)}
            onEditPress={onEditJourneyPress}
          />
          <HighlightVideosSection
            library={resolvedProfile.highlightVideos}
            editable={Boolean(onManageVideosPress)}
            onManagePress={onManageVideosPress}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Football Identity"
          subtitle="Positions, career path, and professional details"
        >
          <PlayingIdentitySection identity={resolvedProfile.identity} />
          <PersonalIdentitySection identity={resolvedProfile.identity} />
          <CareerIdentitySection identity={resolvedProfile.identity} />
          <ProfessionalIdentitySection identity={resolvedProfile.identity} />
          <ProfileDetails profile={resolvedProfile} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Performance Snapshot"
          subtitle="Stats, match logs, and performance summary"
        >
          <ProfileStatsGrid stats={resolvedProfile.stats} />
          <PlayerStatisticsSection
            matches={resolvedProfile.statisticsMatches}
            onLogMatchPress={onLogMatchPress}
          />
          <PerformanceSummary items={resolvedProfile.performanceSummary} />
        </CollapsibleSection>
        <Button variant="secondary" onPress={onEditPress}>
          Edit Football Identity
        </Button>
        {onSignOut ? (
          <Button variant="ghost" onPress={onSignOut}>
            Sign out
          </Button>
        ) : null}
      </View>
    </Screen>
  );
}

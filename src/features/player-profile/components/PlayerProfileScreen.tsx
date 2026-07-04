import { View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
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
import { PersonalIdentitySection } from '@/features/player-profile/components/identity/ProfessionalIdentitySection';
import { PlayingIdentitySection } from '@/features/player-profile/components/identity/PlayingIdentitySection';
import { ProfessionalIdentitySection } from '@/features/player-profile/components/identity/ProfessionalIdentitySection';
import { type PlayerProfile } from '@/features/player-profile/types';
import { PlayerStatisticsSection } from '@/features/player-statistics';
import {
  FootballJourneySection,
  useFootballJourney,
} from '@/features/football-journey';
import { HighlightVideosSection } from '@/features/highlight-videos';

export type PlayerProfileScreenProps = {
  profile?: PlayerProfile | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onEditPress?: () => void;
  onEditJourneyPress?: () => void;
  onManageVideosPress?: () => void;
  onLogMatchPress?: () => void;
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
}: PlayerProfileScreenProps) {
  const { profile, isLoading, error } = usePlayerProfile();
  const resolvedProfile = controlledProfile ?? profile;
  const resolvedLoading = controlledLoading ?? isLoading;
  const resolvedError = controlledError ?? error;
  const { entries: journeyEntries } = useFootballJourney(resolvedProfile);

  if (resolvedLoading) {
    return (
      <Screen title="Player Profile" subtitle="Preparing your profile snapshot" safeArea>
        <SkeletonLoader variant="profile" />
      </Screen>
    );
  }

  if (resolvedError) {
    return (
      <Screen title="Player Profile" subtitle="We couldn’t fetch your profile" safeArea>
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
      <Screen title="Player Profile" subtitle="No profile data available" safeArea>
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
    <Screen title="Player Profile" subtitle="Your football identity on ScoutX" safeArea>
      <View className="gap-4">
        <ProfileHero profile={resolvedProfile} onEditPress={onEditPress} />
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
        <PlayingIdentitySection identity={resolvedProfile.identity} />
        <PersonalIdentitySection identity={resolvedProfile.identity} />
        <CareerIdentitySection identity={resolvedProfile.identity} />
        <ProfessionalIdentitySection identity={resolvedProfile.identity} />
        <ProfileDetails profile={resolvedProfile} />
        <ProfileStatsGrid stats={resolvedProfile.stats} />
        <PlayerStatisticsSection
          matches={resolvedProfile.statisticsMatches}
          onLogMatchPress={onLogMatchPress}
        />
        <PerformanceSummary items={resolvedProfile.performanceSummary} />
        <Button variant="secondary" onPress={onEditPress}>
          Edit Football Identity
        </Button>
      </View>
    </Screen>
  );
}

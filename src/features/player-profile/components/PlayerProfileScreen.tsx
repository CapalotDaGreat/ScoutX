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
import { type PlayerProfile } from '@/features/player-profile/types';

export type PlayerProfileScreenProps = {
  profile?: PlayerProfile | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onEditPress?: () => void;
};

export function PlayerProfileScreen({
  profile: controlledProfile,
  loading: controlledLoading,
  error: controlledError,
  onRetry,
  onEditPress,
}: PlayerProfileScreenProps) {
  const { profile, isLoading, error } = usePlayerProfile();
  const resolvedProfile = controlledProfile ?? profile;
  const resolvedLoading = controlledLoading ?? isLoading;
  const resolvedError = controlledError ?? error;

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
    <Screen title="Player Profile" subtitle="Athletic profile overview" safeArea>
      <View className="gap-4">
        <ProfileHero profile={resolvedProfile} onEditPress={onEditPress} />
        <ProfileStatsGrid stats={resolvedProfile.stats} />
        <ProfileDetails profile={resolvedProfile} />
        <PerformanceSummary items={resolvedProfile.performanceSummary} />
        <Button variant="secondary" onPress={onEditPress}>
          Edit Profile
        </Button>
      </View>
    </Screen>
  );
}

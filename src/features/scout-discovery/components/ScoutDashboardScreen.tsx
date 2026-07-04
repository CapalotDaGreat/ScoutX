import { useMemo } from 'react';
import { View } from 'react-native';
import { MapPin, Search } from 'lucide-react-native';
import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { SearchBar } from '@/components/primitives/SearchBar';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { ContinueScoutingCard } from '@/features/scout-discovery/components/ContinueScoutingCard';
import { DashboardHeader } from '@/features/scout-discovery/components/DashboardHeader';
import { DashboardSection } from '@/features/scout-discovery/components/DashboardSection';
import { PlayerCarousel } from '@/features/scout-discovery/components/PlayerCarousel';
import { useScoutDashboard } from '@/features/scout-discovery/hooks/useScoutDashboard';
import { useScoutWorkspace } from '@/features/scout-discovery/hooks/useScoutWorkspace';
import { getMockPlayerById, mockDiscoverablePlayers } from '@/features/scout-discovery/services/mockPlayerDiscoveryData';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';
import { useTheme } from '@/theme';

export type ScoutDashboardScreenProps = {
  scoutName: string;
  onDiscoverPress: () => void;
  onPipelinePress: () => void;
  pipelineCount: number;
  onPlayerPress: (player: DiscoverablePlayer) => void;
  onSignOut: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
};

export function ScoutDashboardScreen({
  scoutName,
  onDiscoverPress,
  onPipelinePress,
  pipelineCount,
  onPlayerPress,
  onSignOut,
  searchValue,
  onSearchChange,
  onSearchSubmit,
}: ScoutDashboardScreenProps) {
  const { colors } = useTheme();
  const { data, isLoading, error, refresh } = useScoutDashboard();
  const workspace = useScoutWorkspace();

  const continuePlayer = useMemo(() => {
    if (!workspace.lastViewedPlayerId) {
      return null;
    }
    return getMockPlayerById(workspace.lastViewedPlayerId) ?? null;
  }, [workspace.lastViewedPlayerId]);

  const recentlyViewedPlayers = useMemo(
    () => workspace.resolvePlayers(workspace.recentlyViewedIds, mockDiscoverablePlayers),
    [workspace],
  );

  if (isLoading && !data) {
    return (
      <Screen safeArea contentClassName="gap-6">
        <SkeletonLoader variant="profile" />
        <SkeletonLoader variant="card" count={2} />
      </Screen>
    );
  }

  return (
    <Screen
      onRefresh={refresh}
      error={error}
      onRetry={refresh}
      safeArea
      contentClassName="gap-8 pb-6"
      header={
        <View className="mb-2 flex-row justify-end">
          <Button variant="ghost" size="sm" onPress={onSignOut}>
            Sign out
          </Button>
        </View>
      }
    >
      <DashboardHeader
        scoutName={scoutName}
        matchingCount={data?.matchingCount ?? 0}
        savedCount={pipelineCount}
        recentlyViewedCount={workspace.recentlyViewedIds.length}
      />

      <SearchBar
        value={searchValue}
        onChangeText={onSearchChange}
        onClear={() => onSearchChange('')}
        placeholder="Search players, clubs, positions..."
        onSubmitEditing={onSearchSubmit}
        returnKeyType="search"
      />

      <View className="flex-row gap-3">
        <Button variant="accent" className="flex-1" onPress={onDiscoverPress}>
          Discover Talent
        </Button>
        <Button variant="secondary" className="flex-1" onPress={onPipelinePress}>
          Pipeline ({pipelineCount})
        </Button>
      </View>

      {continuePlayer ? (
        <ContinueScoutingCard player={continuePlayer} onPress={onPlayerPress} />
      ) : null}

      {data ? (
        <>
          <DashboardSection
            title="Players Matching Your Preferences"
            subtitle="Based on age, potential and verification signals"
            actionLabel="See all"
            onActionPress={onDiscoverPress}
          >
            <PlayerCarousel
              players={data.matchingPreferences}
              onPlayerPress={onPlayerPress}
              variant="premium"
            />
          </DashboardSection>

          {recentlyViewedPlayers.length > 0 ? (
            <DashboardSection
              title="Recently Viewed"
              subtitle="Continue evaluating profiles you opened recently"
              actionLabel="Browse"
              onActionPress={onDiscoverPress}
            >
              <PlayerCarousel
                players={recentlyViewedPlayers}
                onPlayerPress={onPlayerPress}
                variant="compact"
              />
            </DashboardSection>
          ) : null}

          <DashboardSection
            title="Trending Players"
            subtitle="Most viewed talent this week"
            actionLabel="Explore"
            onActionPress={onDiscoverPress}
          >
            <PlayerCarousel players={data.trending} onPlayerPress={onPlayerPress} />
          </DashboardSection>

          <DashboardSection
            title="Featured Prospects"
            subtitle="Verified players with standout potential"
            actionLabel="View more"
            onActionPress={onDiscoverPress}
          >
            <PlayerCarousel players={data.featured} onPlayerPress={onPlayerPress} variant="premium" />
          </DashboardSection>

          <DashboardSection
            title="Nearby Players"
            subtitle="Location-based discovery — ready for GPS rollout"
          >
            {data.nearby.length > 0 ? (
              <PlayerCarousel players={data.nearby} onPlayerPress={onPlayerPress} variant="compact" />
            ) : (
              <View className="flex-row items-center gap-3 rounded-xl border border-dashed border-border bg-background-secondary p-4 dark:border-neutral-800 dark:bg-neutral-950">
                <MapPin size={18} color={colors.textSecondary} />
                <View className="flex-1">
                  <Text weight="semibold">Proximity scouting</Text>
                  <Text variant="body-sm" color="secondary">
                    Enable location to surface players training near you.
                  </Text>
                </View>
              </View>
            )}
          </DashboardSection>
        </>
      ) : (
        <EmptyState
          title="Your scouting feed is warming up"
          description="Pull to refresh or start discovering players across leagues and academies."
          actionLabel="Start Discovering"
          onAction={onDiscoverPress}
        />
      )}

      {!data && !isLoading ? (
        <View className="items-center gap-2 py-4">
          <Search size={20} color={colors.textTertiary} />
          <Text variant="body-sm" color="secondary" className="text-center">
            Tip: use presets in Discover to save your preferred scouting filters.
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}


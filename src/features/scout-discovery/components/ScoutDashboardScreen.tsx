import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Search } from 'lucide-react-native';
import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { SearchBar } from '@/components/primitives/SearchBar';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { HeaderActionCluster, HeaderIconButton } from '@/components/navigation/HeaderIconButton';
import { ComparisonQueueCard } from '@/features/player-comparison/components/ComparisonQueueCard';
import { ContinueScoutingCard } from '@/features/scout-discovery/components/ContinueScoutingCard';
import { DashboardHeader } from '@/features/scout-discovery/components/DashboardHeader';
import { ActivityBellButton, ActivityFeedSection, useActivities } from '@/features/activity-feed';
import { DashboardSection } from '@/features/scout-discovery/components/DashboardSection';
import { PlayerCarousel } from '@/features/scout-discovery/components/PlayerCarousel';
import { useScoutDashboard } from '@/features/scout-discovery/hooks/useScoutDashboard';
import { useScoutWorkspace } from '@/features/scout-discovery/hooks/useScoutWorkspace';
import { PlayerDiscoveryRepository } from '@/features/scout-discovery/repositories/PlayerDiscoveryRepository';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';
import { useRecruitment, RECRUITMENT_STAGE_LABELS } from '@/features/scout-recruitment';
import { useCompactLayout } from '@/hooks/useCompactLayout';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';
import { WatchlistEventsCard } from '@/features/scout-intelligence/components/WatchlistEventsCard';
import { CoachRosterCard } from '@/features/coach-mode/components/CoachRosterCard';
import { useAuth } from '@/features/auth/store/AuthProvider';

export type ScoutDashboardScreenProps = {
  scoutName: string;
  onDiscoverPress: () => void;
  onPipelinePress: () => void;
  onActivityPress: () => void;
  pipelineCount: number;
  onPlayerPress: (player: DiscoverablePlayer) => void;
  onPlayerIdPress?: (playerId: string) => void;
  onOpenComparisonPress?: () => void;
  onSettingsPress?: () => void;
  onSearchPress?: () => void;
  onSignOut?: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  embeddedInTabShell?: boolean;
};

export function ScoutDashboardScreen({
  scoutName,
  onDiscoverPress,
  onPipelinePress,
  onActivityPress,
  pipelineCount,
  onPlayerPress,
  onPlayerIdPress,
  onOpenComparisonPress,
  onSettingsPress,
  onSearchPress,
  onSignOut,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  embeddedInTabShell = false,
}: ScoutDashboardScreenProps) {
  const { t } = useAppTranslation(['scout', 'common', 'errors']);
  const { role, user } = useAuth();
  const { colors } = useTheme();
  const { isTablet } = useCompactLayout();
  const { data, isLoading, error, refresh } = useScoutDashboard();
  const { unreadCount } = useActivities();
  const workspace = useScoutWorkspace();
  const recruitment = useRecruitment();
  const [resolvedPlayers, setResolvedPlayers] = useState<DiscoverablePlayer[]>([]);
  const watchedPlayerNames = useMemo(
    () =>
      Object.fromEntries(
        (recruitment.workspace?.entries ?? []).map((entry) => [entry.playerId, entry.playerName]),
      ),
    [recruitment.workspace?.entries],
  );

  useEffect(() => {
    const ids = [
      ...(workspace.lastViewedPlayerId ? [workspace.lastViewedPlayerId] : []),
      ...workspace.recentlyViewedIds,
    ];
    if (ids.length === 0) {
      setResolvedPlayers([]);
      return;
    }

    void PlayerDiscoveryRepository.getInstance()
      .fetchPlayersByIds(ids)
      .then(setResolvedPlayers)
      .catch(() => setResolvedPlayers([]));
  }, [workspace.lastViewedPlayerId, workspace.recentlyViewedIds]);

  const continuePlayer = useMemo(() => {
    if (!workspace.lastViewedPlayerId) {
      return null;
    }
    return resolvedPlayers.find((player) => player.id === workspace.lastViewedPlayerId) ?? null;
  }, [resolvedPlayers, workspace.lastViewedPlayerId]);

  const continuePipelineStageLabel = useMemo(() => {
    if (!continuePlayer) {
      return null;
    }
    const entry = recruitment.getEntry(continuePlayer.id);
    return entry ? RECRUITMENT_STAGE_LABELS[entry.stage] : null;
  }, [continuePlayer, recruitment]);

  const recentlyViewedPlayers = useMemo(
    () => workspace.resolvePlayers(workspace.recentlyViewedIds, resolvedPlayers),
    [resolvedPlayers, workspace],
  );

  const hasDiscoverablePlayers =
    (data?.matchingPreferences.length ?? 0) > 0 ||
    (data?.featured.length ?? 0) > 0;

  const screenProps = embeddedInTabShell ? { embeddedInTabShell: true as const } : {};

  if (isLoading && !data) {
    return (
      <Screen safeArea contentClassName="gap-6" {...screenProps}>
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
      {...screenProps}
      headerActions={
        <HeaderActionCluster>
          {onSearchPress ? (
            <HeaderIconButton
              icon="search"
              accessibilityLabel={t('common:search')}
              onPress={onSearchPress}
            />
          ) : null}
          <ActivityBellButton unreadCount={unreadCount} onPress={onActivityPress} />
          {onSettingsPress ? (
            <HeaderIconButton
              accessibilityLabel={t('common:settings')}
              onPress={onSettingsPress}
            />
          ) : onSignOut ? (
            <Button variant="ghost" size="sm" onPress={onSignOut}>
              {t('common:signOut')}
            </Button>
          ) : null}
        </HeaderActionCluster>
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
        placeholder={t('scout:dashboard.searchPlaceholder')}
        onSubmitEditing={onSearchSubmit}
        returnKeyType="search"
      />

      <View className="flex-row gap-3">
        <Button variant="accent" className="flex-1" onPress={onDiscoverPress}>
          {t('scout:dashboard.discoverTalent')}
        </Button>
        <Button variant="secondary" className="flex-1" onPress={onPipelinePress}>
          {t('scout:dashboard.pipelineWithCount', { count: pipelineCount })}
        </Button>
      </View>

      {onOpenComparisonPress ? (
        <ComparisonQueueCard onOpenComparison={onOpenComparisonPress} />
      ) : null}

      <WatchlistEventsCard
        scoutId={recruitment.workspace?.scoutId ?? null}
        playerNames={watchedPlayerNames}
        onPlayerPress={onPlayerIdPress}
      />
      {role === 'coach' ? <CoachRosterCard coachId={user?.uid ?? null} /> : null}

      <ActivityFeedSection onViewAllPress={onActivityPress} limit={3} />

      {continuePlayer ? (
        <ContinueScoutingCard
          player={continuePlayer}
          onPress={onPlayerPress}
          pipelineStageLabel={continuePipelineStageLabel}
          onOpenPipelinePress={onPipelinePress}
        />
      ) : null}

      {data && hasDiscoverablePlayers ? (
        <>
          {isTablet ? (
            <View className="flex-row gap-4">
              <View className="flex-1 gap-8">
                <DashboardSection
                  title={t('scout:dashboard.matchingPreferencesTitle')}
                  subtitle={t('scout:dashboard.matchingPreferencesSubtitle')}
                  actionLabel={t('scout:dashboard.seeAll')}
                  onActionPress={onDiscoverPress}
                >
                  <PlayerCarousel
                    players={data.matchingPreferences}
                    onPlayerPress={onPlayerPress}
                    variant="premium"
                  />
                </DashboardSection>
              </View>

              <View className="flex-1 gap-8">
                {recentlyViewedPlayers.length > 0 ? (
                  <DashboardSection
                    title={t('scout:dashboard.recentlyViewedTitle')}
                    subtitle={t('scout:dashboard.recentlyViewedSubtitle')}
                    actionLabel={t('scout:dashboard.browse')}
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
                  title={t('scout:dashboard.featuredTitle')}
                  subtitle={t('scout:dashboard.featuredSubtitle')}
                  actionLabel={t('scout:dashboard.viewMore')}
                  onActionPress={onDiscoverPress}
                >
                  <PlayerCarousel players={data.featured} onPlayerPress={onPlayerPress} variant="premium" />
                </DashboardSection>
              </View>
            </View>
          ) : (
            <>
          <DashboardSection
            title={t('scout:dashboard.matchingPreferencesTitle')}
            subtitle={t('scout:dashboard.matchingPreferencesSubtitle')}
            actionLabel={t('scout:dashboard.seeAll')}
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
              title={t('scout:dashboard.recentlyViewedTitle')}
              subtitle={t('scout:dashboard.recentlyViewedSubtitle')}
              actionLabel={t('scout:dashboard.browse')}
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
            title={t('scout:dashboard.featuredTitle')}
            subtitle={t('scout:dashboard.featuredSubtitle')}
            actionLabel={t('scout:dashboard.viewMore')}
            onActionPress={onDiscoverPress}
          >
            <PlayerCarousel players={data.featured} onPlayerPress={onPlayerPress} variant="premium" />
          </DashboardSection>
            </>
          )}
        </>
      ) : (
        <EmptyState
          title={t('scout:dashboard.emptyTitle')}
          description={t('scout:dashboard.emptyDescription')}
          actionLabel={t('scout:dashboard.emptyAction')}
          onAction={onDiscoverPress}
        />
      )}

      {!hasDiscoverablePlayers && !isLoading ? (
        <View className="items-center gap-2 py-4">
          <Search size={20} color={colors.textTertiary} />
          <Text variant="body-sm" color="secondary" className="text-center">
            {t('scout:dashboard.presetTip')}
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}


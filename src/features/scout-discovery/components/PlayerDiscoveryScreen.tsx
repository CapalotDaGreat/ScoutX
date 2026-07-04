import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Button } from '@/components/primitives/Button';
import { Heading } from '@/components/primitives/Heading';
import { SearchBar } from '@/components/primitives/SearchBar';
import { Text } from '@/components/primitives/Text';
import { FlashListView } from '@/components/lists/FlashListView';
import { ActiveFilterChips } from '@/features/scout-discovery/components/ActiveFilterChips';
import { DiscoveryCardSkeleton, DiscoveryListSkeleton } from '@/features/scout-discovery/components/DiscoveryCardSkeleton';
import { DiscoveryFilterSheet } from '@/features/scout-discovery/components/DiscoveryFilterSheet';
import { DiscoverySearchPanel } from '@/features/scout-discovery/components/DiscoverySearchPanel';
import { DiscoverySortBar } from '@/features/scout-discovery/components/DiscoverySortBar';
import { FilterPresetBar } from '@/features/scout-discovery/components/FilterPresetBar';
import { PlayerDiscoveryCard } from '@/features/scout-discovery/components/PlayerDiscoveryCard';
import { usePlayerDiscovery } from '@/features/scout-discovery/hooks/usePlayerDiscovery';
import { useScoutWorkspace } from '@/features/scout-discovery/hooks/useScoutWorkspace';
import { mockDiscoverablePlayers } from '@/features/scout-discovery/services/mockPlayerDiscoveryData';
import {
  type DiscoverablePlayer,
  type DiscoveryFilters,
  type DiscoverySortOption,
  type FilterPreset,
} from '@/features/scout-discovery/types';
import { useTheme } from '@/theme';
import { SlidersHorizontal } from 'lucide-react-native';

const CARD_ESTIMATED_HEIGHT = 300;

export type PlayerDiscoveryScreenProps = {
  mode?: 'discover' | 'saved';
  search: string;
  onSearchChange: (value: string) => void;
  onPlayerPress: (player: DiscoverablePlayer) => void;
  onDiscoverPress?: () => void;
  filters: DiscoveryFilters;
  sort: DiscoverySortOption;
  activeFilterCount: number;
  activePresetId: string | null;
  onFilterChange: <Key extends keyof DiscoveryFilters>(
    key: Key,
    value: DiscoveryFilters[Key],
  ) => void;
  onFiltersReplace: (filters: DiscoveryFilters) => void;
  onSortChange: (sort: DiscoverySortOption) => void;
  onResetFilters: () => void;
  onApplyPreset: (preset: FilterPreset) => void;
  onSaveCurrentPreset: () => void;
};

export function PlayerDiscoveryScreen({
  mode = 'discover',
  search,
  onSearchChange,
  onPlayerPress,
  onDiscoverPress,
  filters,
  sort,
  activeFilterCount,
  activePresetId,
  onFilterChange,
  onFiltersReplace,
  onSortChange,
  onResetFilters,
  onApplyPreset,
  onSaveCurrentPreset,
}: PlayerDiscoveryScreenProps) {
  const { colors } = useTheme();
  const workspace = useScoutWorkspace();
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const { players, isLoading, isLoadingMore, error, loadMore, refresh } =
    usePlayerDiscovery({ search, filters, sort, enabled: mode === 'discover' });

  const savedPlayers = useMemo(() => {
    const lookup = new Map(mockDiscoverablePlayers.map((player) => [player.id, player]));
    return workspace.favouriteIds
      .map((id) => lookup.get(id))
      .filter((player): player is DiscoverablePlayer => Boolean(player));
  }, [workspace.favouriteIds]);

  const isSavedMode = mode === 'saved';

  const handleSearchSelect = useCallback(
    (term: string) => {
      onSearchChange(term);
      workspace.recordSearch(term);
      setSearchFocused(false);
    },
    [onSearchChange, workspace],
  );

  const handleSearchSubmit = useCallback(() => {
    if (search.trim()) {
      workspace.recordSearch(search);
    }
    setSearchFocused(false);
  }, [search, workspace]);

  const filteredSavedPlayers = useMemo(() => {
    if (!isSavedMode) {
      return savedPlayers;
    }
    if (!search.trim()) {
      return savedPlayers;
    }
    const query = search.trim().toLowerCase();
    return savedPlayers.filter((player) =>
      player.searchKeywords.some((keyword) => keyword.includes(query)),
    );
  }, [isSavedMode, savedPlayers, search]);

  const finalPlayers = isSavedMode ? filteredSavedPlayers : players;

  const renderItem = useCallback(
    ({ item, index }: { item: DiscoverablePlayer; index: number }) => (
      <View className="mb-3 px-4">
        <PlayerDiscoveryCard
          player={item}
          index={index}
          onPress={onPlayerPress}
          isFavourite={workspace.isFavourite(item.id)}
          onToggleFavourite={workspace.toggleFavourite}
        />
      </View>
    ),
    [onPlayerPress, workspace],
  );

  const listHeader = (
    <View className="gap-4 px-4 pb-2 pt-2">
      <SearchBar
        value={search}
        onChangeText={onSearchChange}
        onClear={() => onSearchChange('')}
        placeholder={
          isSavedMode
            ? 'Search within saved players...'
            : 'Search by name, club, nationality, position...'
        }
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
        onSubmitEditing={handleSearchSubmit}
      />

      {!isSavedMode ? (
        <DiscoverySearchPanel
          visible={searchFocused}
          search={search}
          recentSearches={workspace.recentSearches}
          onSelectSearch={handleSearchSelect}
          onClearRecent={workspace.clearRecentSearches}
        />
      ) : null}

      {!isSavedMode ? (
        <>
          <FilterPresetBar
            presets={workspace.filterPresets}
            activePresetId={activePresetId}
            onApplyPreset={onApplyPreset}
            onSaveCurrent={onSaveCurrentPreset}
          />
          <View className="flex-row items-center gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              leftIcon={<SlidersHorizontal size={18} color={colors.textPrimary} />}
              onPress={() => setFiltersVisible(true)}
            >
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Button>
          </View>
          <ActiveFilterChips
            filters={filters}
            onChange={onFiltersReplace}
            onClearAll={onResetFilters}
          />
          <DiscoverySortBar sort={sort} onSortChange={onSortChange} />
        </>
      ) : null}
    </View>
  );

  if (!isSavedMode && isLoading && players.length === 0) {
    return (
      <SafeAreaView className="flex-1" edges={['top']}>
        <View className="border-b border-divider px-4 pb-4 pt-4 dark:border-neutral-800">
          <Heading level={2}>Discover Players</Heading>
          <Text variant="body-sm" color="secondary" className="mt-1">
            Search the global talent pool
          </Text>
        </View>
        <DiscoveryListSkeleton count={4} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" edges={['top']}>
      <FlashListView
        data={finalPlayers}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        estimatedItemSize={CARD_ESTIMATED_HEIGHT}
        ListHeaderComponent={
          <>
            <View className="border-b border-divider px-4 pb-4 pt-4 dark:border-neutral-800">
              <Heading level={2}>{isSavedMode ? 'Saved Players' : 'Discover Players'}</Heading>
              <Text variant="body-sm" color="secondary" className="mt-1">
                {isSavedMode
                  ? `${workspace.favouriteIds.length} players in your shortlist`
                  : 'Advanced scouting search with instant results'}
              </Text>
            </View>
            {listHeader}
          </>
        }
        ListEmptyComponent={
          <View className="px-4 py-8">
            {isSavedMode ? (
              <EmptyState
                title="No saved players yet"
                description="Tap the bookmark icon on any player card to build your shortlist."
                actionLabel={onDiscoverPress ? 'Discover Players' : undefined}
                onAction={onDiscoverPress}
              />
            ) : (
              <EmptyState
                title={search ? 'No players match your search' : 'No players available'}
                description={
                  search
                    ? 'Try a different keyword, remove filter chips, or apply a saved preset.'
                    : 'Players will appear here once profiles are indexed in ScoutX.'
                }
                actionLabel={activeFilterCount > 0 ? 'Clear Filters' : undefined}
                onAction={activeFilterCount > 0 ? onResetFilters : undefined}
              />
            )}
          </View>
        }
        onEndReached={isSavedMode ? undefined : loadMore}
        onEndReachedThreshold={0.4}
        refreshing={!isSavedMode && isLoading}
        onRefresh={isSavedMode ? undefined : refresh}
        ListFooterComponent={
          !isSavedMode && isLoadingMore ? (
            <View className="gap-3 px-4 py-4">
              <DiscoveryCardSkeleton />
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : null
        }
      />

      {error && !isSavedMode ? (
        <View className="px-4 pb-4">
          <EmptyState
            title="Unable to load players"
            description={error}
            actionLabel="Retry"
            onAction={refresh}
          />
        </View>
      ) : null}

      <DiscoveryFilterSheet
        visible={filtersVisible}
        filters={filters}
        onClose={() => setFiltersVisible(false)}
        onChange={onFilterChange}
        onReset={onResetFilters}
        onApply={() => setFiltersVisible(false)}
      />
    </SafeAreaView>
  );
}

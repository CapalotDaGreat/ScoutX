import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AppSafeAreaView } from '@/components/layout/AppSafeAreaView';
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
import { useScoutPlayerSave } from '@/features/scout-recruitment/hooks/useScoutPlayerSave';
import {
  type DiscoverablePlayer,
  type DiscoveryFilters,
  type DiscoverySortOption,
  type FilterPreset,
} from '@/features/scout-discovery/types';
import { useTheme } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { SlidersHorizontal } from 'lucide-react-native';
import { HeaderIconButton } from '@/components/navigation/HeaderIconButton';

export type PlayerDiscoveryScreenProps = {
  search: string;
  onSearchChange: (value: string) => void;
  onPlayerPress: (player: DiscoverablePlayer) => void;
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
  onSettingsPress?: () => void;
  guestMode?: boolean;
};

export function PlayerDiscoveryScreen({
  search,
  onSearchChange,
  onPlayerPress,
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
  onSettingsPress,
  guestMode = false,
}: PlayerDiscoveryScreenProps) {
  const { t } = useAppTranslation(['scout', 'common', 'errors']);
  const { colors } = useTheme();
  const workspace = useScoutWorkspace();
  const playerSave = useScoutPlayerSave();
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const { players, isLoading, isLoadingMore, error, loadMore, refresh } = usePlayerDiscovery({
    search,
    filters,
    sort,
    enabled: true,
  });

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

  const renderItem = useCallback(
    ({ item, index }: { item: DiscoverablePlayer; index: number }) => (
      <View className="mb-3 px-4">
        <PlayerDiscoveryCard
          player={item}
          index={index}
          onPress={onPlayerPress}
          isSaved={guestMode ? false : playerSave.isSaved(item.id)}
          onToggleSave={
            guestMode
              ? undefined
              : () => {
                  void playerSave.toggleSave(item);
                }
          }
          isInComparison={guestMode ? false : workspace.isInComparison(item.id)}
          canAddToComparison={guestMode ? false : workspace.canAddToComparison}
          onToggleCompare={
            guestMode
              ? undefined
              : (playerId) => {
                  if (workspace.isInComparison(playerId)) {
                    workspace.removeFromComparison(playerId);
                    return;
                  }
                  workspace.addToComparison(playerId);
                }
          }
        />
      </View>
    ),
    [guestMode, onPlayerPress, playerSave, workspace],
  );

  const listHeader = (
    <View className="gap-4 px-4 pb-2 pt-2">
      <SearchBar
        value={search}
        onChangeText={onSearchChange}
        onClear={() => onSearchChange('')}
        placeholder={t('scout:discover.searchPlaceholder')}
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
        onSubmitEditing={handleSearchSubmit}
      />

      <DiscoverySearchPanel
        visible={searchFocused}
        search={search}
        recentSearches={workspace.recentSearches}
        onSelectSearch={handleSearchSelect}
        onClearRecent={workspace.clearRecentSearches}
      />

      <FilterPresetBar
        presets={workspace.filterPresets}
        activePresetId={activePresetId}
        onApplyPreset={onApplyPreset}
        onSaveCurrent={guestMode ? undefined : onSaveCurrentPreset}
      />
      <View className="flex-row items-center gap-3">
        <Button
          variant="secondary"
          className="flex-1"
          leftIcon={<SlidersHorizontal size={18} color={colors.textPrimary} />}
          onPress={() => setFiltersVisible(true)}
        >
          {activeFilterCount > 0
            ? t('scout:discover.filtersWithCount', { count: activeFilterCount })
            : t('scout:discover.filters')}
        </Button>
      </View>
      <ActiveFilterChips filters={filters} onChange={onFiltersReplace} onClearAll={onResetFilters} />
      <DiscoverySortBar sort={sort} onSortChange={onSortChange} />
    </View>
  );

  if (isLoading && players.length === 0) {
    return (
      <AppSafeAreaView className="flex-1" edges={['top']}>
        <View className="flex-row items-start gap-2 border-b border-divider px-4 pb-4 pt-4">
          <View className="min-w-0 flex-1">
            <Heading level={2}>{t('scout:discover.title')}</Heading>
            <Text variant="body-sm" color="secondary" className="mt-1">
              {t('scout:discover.loadingSubtitle')}
            </Text>
          </View>
          {onSettingsPress ? (
            <View className="shrink-0">
              <HeaderIconButton
                accessibilityLabel={t('common:settings')}
                onPress={onSettingsPress}
              />
            </View>
          ) : null}
        </View>
        <DiscoveryListSkeleton count={4} />
      </AppSafeAreaView>
    );
  }

  return (
    <AppSafeAreaView className="flex-1" edges={['top']}>
      <FlashListView
        data={players}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <>
            <View className="flex-row items-start gap-2 border-b border-divider px-4 pb-4 pt-4">
              <View className="min-w-0 flex-1">
                <Heading level={2}>{t('scout:discover.title')}</Heading>
                <Text variant="body-sm" color="secondary" className="mt-1">
                  {t('scout:discover.subtitle')}
                </Text>
              </View>
              {onSettingsPress ? (
                <View className="shrink-0">
                  <HeaderIconButton
                    accessibilityLabel={t('common:settings')}
                    onPress={onSettingsPress}
                  />
                </View>
              ) : null}
            </View>
            {listHeader}
          </>
        }
        ListEmptyComponent={
          <View className="px-4 py-8">
            <EmptyState
              title={
                search
                  ? t('scout:discover.noSearchResults')
                  : t('scout:discover.noPlayersAvailable')
              }
              description={
                search
                  ? t('scout:discover.noSearchResultsDescription')
                  : t('scout:discover.noPlayersDescription')
              }
              actionLabel={activeFilterCount > 0 ? t('scout:discover.clearFilters') : undefined}
              onAction={activeFilterCount > 0 ? onResetFilters : undefined}
            />
          </View>
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshing={isLoading}
        onRefresh={refresh}
        ListFooterComponent={
          isLoadingMore ? (
            <View className="gap-3 px-4 py-4">
              <DiscoveryCardSkeleton />
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : null
        }
      />

      {error ? (
        <View className="px-4 pb-4">
          <EmptyState
            title={t('errors:loadPlayers')}
            description={error}
            actionLabel={t('common:retry')}
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
    </AppSafeAreaView>
  );
}

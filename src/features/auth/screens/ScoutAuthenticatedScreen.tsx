import { useCallback, useState } from 'react';
import { View } from 'react-native';
import Animated, { SlideInRight, SlideOutRight } from 'react-native-reanimated';
import { ScoutDashboardScreen } from '@/features/scout-discovery/components/ScoutDashboardScreen';
import { PlayerDiscoveryScreen } from '@/features/scout-discovery/components/PlayerDiscoveryScreen';
import { PlayerDetailScreen } from '@/features/scout-discovery/components/PlayerDetailScreen';
import { ScoutShell, type ScoutTab } from '@/features/scout-discovery/components/ScoutShell';
import { useDiscoveryFilters } from '@/features/scout-discovery/hooks/useDiscoveryFilters';
import {
  ScoutWorkspaceProvider,
  useScoutWorkspace,
} from '@/features/scout-discovery/hooks/useScoutWorkspace';
import { type DiscoverablePlayer, type FilterPreset } from '@/features/scout-discovery/types';
import { useAuth } from '@/features/auth/store/AuthProvider';

export type ScoutAuthenticatedScreenProps = {
  onSignOut: () => Promise<void>;
};

function ScoutAuthenticatedContent({ onSignOut }: ScoutAuthenticatedScreenProps) {
  const { user } = useAuth();
  const workspace = useScoutWorkspace();
  const [activeTab, setActiveTab] = useState<ScoutTab>('dashboard');
  const [search, setSearch] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [detailOrigin, setDetailOrigin] = useState<ScoutTab>('discover');

  const {
    filters,
    sort,
    activeFilterCount,
    activePresetId,
    updateFilter,
    setFilters,
    setSort,
    resetFilters,
    applyPreset,
  } = useDiscoveryFilters();

  const scoutName = user?.name?.split(' ')[0] ?? 'Scout';

  const openPlayer = useCallback((player: DiscoverablePlayer, origin: ScoutTab = activeTab) => {
    setDetailOrigin(origin);
    setSelectedPlayerId(player.id);
  }, [activeTab]);

  const handleBackFromDetail = useCallback(() => {
    setSelectedPlayerId(null);
    setActiveTab(detailOrigin === 'dashboard' ? 'dashboard' : detailOrigin);
  }, [detailOrigin]);

  const handleDiscoverPress = useCallback(() => {
    setActiveTab('discover');
  }, []);

  const handleSearchSubmit = useCallback(() => {
    if (search.trim()) {
      workspace.recordSearch(search);
    }
    setActiveTab('discover');
  }, [search, workspace]);

  const handleSaveCurrentPreset = useCallback(() => {
    const preset: FilterPreset = {
      id: `preset-custom-${Date.now()}`,
      name: `Preset ${workspace.filterPresets.length + 1}`,
      filters,
      sort,
    };
    workspace.saveFilterPreset(preset);
  }, [filters, sort, workspace]);

  if (selectedPlayerId) {
    return (
      <Animated.View
        entering={SlideInRight.duration(280)}
        exiting={SlideOutRight.duration(220)}
        className="flex-1"
      >
        <PlayerDetailScreen playerId={selectedPlayerId} onBack={handleBackFromDetail} />
      </Animated.View>
    );
  }

  return (
    <ScoutShell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      savedCount={workspace.favouriteIds.length}
    >
      {activeTab === 'dashboard' ? (
        <ScoutDashboardScreen
          scoutName={scoutName}
          searchValue={search}
          onSearchChange={setSearch}
          onSearchSubmit={handleSearchSubmit}
          onDiscoverPress={handleDiscoverPress}
          onSavedPress={() => setActiveTab('saved')}
          onPlayerPress={(player) => openPlayer(player, 'dashboard')}
          onSignOut={onSignOut}
        />
      ) : null}

      {activeTab === 'discover' ? (
        <PlayerDiscoveryScreen
          mode="discover"
          search={search}
          onSearchChange={setSearch}
          onPlayerPress={(player) => openPlayer(player, 'discover')}
          filters={filters}
          sort={sort}
          activeFilterCount={activeFilterCount}
          activePresetId={activePresetId}
          onFilterChange={updateFilter}
          onFiltersReplace={setFilters}
          onSortChange={setSort}
          onResetFilters={resetFilters}
          onApplyPreset={applyPreset}
          onSaveCurrentPreset={handleSaveCurrentPreset}
        />
      ) : null}

      {activeTab === 'saved' ? (
        <PlayerDiscoveryScreen
          mode="saved"
          search={search}
          onSearchChange={setSearch}
          onPlayerPress={(player) => openPlayer(player, 'saved')}
          onDiscoverPress={handleDiscoverPress}
          filters={filters}
          sort={sort}
          activeFilterCount={activeFilterCount}
          activePresetId={activePresetId}
          onFilterChange={updateFilter}
          onFiltersReplace={setFilters}
          onSortChange={setSort}
          onResetFilters={resetFilters}
          onApplyPreset={applyPreset}
          onSaveCurrentPreset={handleSaveCurrentPreset}
        />
      ) : null}
    </ScoutShell>
  );
}

export function ScoutAuthenticatedScreen({ onSignOut }: ScoutAuthenticatedScreenProps) {
  return (
    <ScoutWorkspaceProvider>
      <View className="flex-1">
        <ScoutAuthenticatedContent onSignOut={onSignOut} />
      </View>
    </ScoutWorkspaceProvider>
  );
}

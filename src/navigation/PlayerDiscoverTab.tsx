import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PlayerDiscoveryScreen } from '@/features/scout-discovery/components/PlayerDiscoveryScreen';
import { useDiscoveryFilters } from '@/features/scout-discovery/hooks/useDiscoveryFilters';
import { ScoutWorkspaceProvider, useScoutWorkspace } from '@/features/scout-discovery/hooks/useScoutWorkspace';
import {
  type DiscoverablePlayer,
  type DiscoverySearchScope,
  type FilterPreset,
} from '@/features/scout-discovery/types';
import { RecruitmentProvider } from '@/features/scout-recruitment';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { type PlayerStackParamList } from '@/navigation/types';

/**
 * Talent-pool search tab for the player shell.
 * Browse-only (guestMode) — pipeline save/compare stays on ScoutApp.
 * Logged-in players can still save personal search filters.
 */
function PlayerDiscoverContent() {
  const navigation = useNavigation<NativeStackNavigationProp<PlayerStackParamList>>();
  const { user } = useAuth();
  const workspace = useScoutWorkspace();
  const [search, setSearch] = useState('');
  const [searchScope, setSearchScope] = useState<DiscoverySearchScope>('all');
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
    setActivePresetId,
  } = useDiscoveryFilters();

  const openPlayer = useCallback(
    (player: DiscoverablePlayer) => {
      navigation.navigate('PlayerDetail', { playerId: player.id });
    },
    [navigation],
  );

  const handleSavePreset = useCallback(
    (name: string, includeSearch: boolean) => {
      const preset: FilterPreset = {
        id: `preset-custom-${Date.now()}`,
        name: name.trim(),
        filters,
        sort,
        ...(includeSearch
          ? {
              search: search.trim(),
              searchScope,
            }
          : {}),
      };
      workspace.saveFilterPreset(preset);
      setActivePresetId(preset.id);
    },
    [filters, search, searchScope, setActivePresetId, sort, workspace],
  );

  return (
    <View className="flex-1 bg-background">
      <PlayerDiscoveryScreen
        search={search}
        onSearchChange={setSearch}
        searchScope={searchScope}
        onSearchScopeChange={setSearchScope}
        filters={filters}
        sort={sort}
        activeFilterCount={activeFilterCount}
        activePresetId={activePresetId}
        onFilterChange={updateFilter}
        onFiltersReplace={setFilters}
        onSortChange={setSort}
        onResetFilters={resetFilters}
        onApplyPreset={applyPreset}
        onSaveCurrentPreset={handleSavePreset}
        onPlayerPress={openPlayer}
        guestMode
        allowSavedFilters={Boolean(user)}
      />
    </View>
  );
}

export function PlayerDiscoverTab() {
  const { user } = useAuth();
  const workspaceUserId = user?.uid ?? user?.id ?? null;

  return (
    <ScoutWorkspaceProvider scoutId={workspaceUserId}>
      <RecruitmentProvider scoutId={null} scoutName={user?.name ?? 'Player'}>
        <PlayerDiscoverContent />
      </RecruitmentProvider>
    </ScoutWorkspaceProvider>
  );
}

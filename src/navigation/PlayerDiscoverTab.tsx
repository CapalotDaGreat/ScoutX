import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PlayerDiscoveryScreen } from '@/features/scout-discovery/components/PlayerDiscoveryScreen';
import { useDiscoveryFilters } from '@/features/scout-discovery/hooks/useDiscoveryFilters';
import { ScoutWorkspaceProvider } from '@/features/scout-discovery/hooks/useScoutWorkspace';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';
import { RecruitmentProvider } from '@/features/scout-recruitment';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { type PlayerStackParamList } from '@/navigation/types';

/**
 * Talent-pool search tab for the player shell.
 * Browse-only (guestMode) — pipeline save/compare stays on ScoutApp.
 */
export function PlayerDiscoverTab() {
  const navigation = useNavigation<NativeStackNavigationProp<PlayerStackParamList>>();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
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

  const openPlayer = useCallback(
    (player: DiscoverablePlayer) => {
      navigation.navigate('PlayerDetail', { playerId: player.id });
    },
    [navigation],
  );

  return (
    <ScoutWorkspaceProvider scoutId={user?.uid ?? null}>
      <RecruitmentProvider scoutId={null} scoutName={user?.name ?? 'Player'}>
        <View className="flex-1 bg-background">
          <PlayerDiscoveryScreen
            search={search}
            onSearchChange={setSearch}
            filters={filters}
            sort={sort}
            activeFilterCount={activeFilterCount}
            activePresetId={activePresetId}
            onFilterChange={updateFilter}
            onFiltersReplace={setFilters}
            onSortChange={setSort}
            onResetFilters={resetFilters}
            onApplyPreset={applyPreset}
            onSaveCurrentPreset={() => undefined}
            onPlayerPress={openPlayer}
            guestMode
          />
        </View>
      </RecruitmentProvider>
    </ScoutWorkspaceProvider>
  );
}

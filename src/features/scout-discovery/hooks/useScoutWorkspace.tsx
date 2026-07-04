import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_FILTER_PRESETS } from '@/features/scout-discovery/constants';
import { MAX_COMPARISON_PLAYERS } from '@/features/player-comparison/constants';
import {
  type DiscoverablePlayer,
  type FilterPreset,
  type ScoutWorkspaceSnapshot,
} from '@/features/scout-discovery/types';
import {
  loadScoutWorkspace,
  saveScoutWorkspace,
} from '@/features/scout-discovery/services/scoutWorkspaceStorage';

function createEmptyWorkspace(): ScoutWorkspaceSnapshot {
  return {
    recentlyViewedIds: [],
    recentSearches: [],
    filterPresets: DEFAULT_FILTER_PRESETS,
    lastViewedPlayerId: null,
    comparisonPlayerIds: [],
  };
}

const MAX_RECENT_SEARCHES = 6;
const MAX_RECENTLY_VIEWED = 12;

type ScoutWorkspaceContextValue = {
  isReady: boolean;
  recentlyViewedIds: string[];
  recentSearches: string[];
  filterPresets: FilterPreset[];
  lastViewedPlayerId: string | null;
  comparisonPlayerIds: string[];
  recordPlayerView: (playerId: string) => void;
  recordSearch: (term: string) => void;
  clearRecentSearches: () => void;
  saveFilterPreset: (preset: FilterPreset) => void;
  removeFilterPreset: (presetId: string) => void;
  resolvePlayers: (ids: string[], pool: DiscoverablePlayer[]) => DiscoverablePlayer[];
  addToComparison: (playerId: string) => boolean;
  removeFromComparison: (playerId: string) => void;
  replaceComparisonPlayer: (currentId: string, nextId: string) => void;
  clearComparison: () => void;
  isInComparison: (playerId: string) => boolean;
  canAddToComparison: boolean;
};

const ScoutWorkspaceContext = createContext<ScoutWorkspaceContextValue | null>(null);

type ScoutWorkspaceProviderProps = {
  scoutId: string | null;
  children: ReactNode;
};

export function ScoutWorkspaceProvider({ scoutId, children }: ScoutWorkspaceProviderProps) {
  const [snapshot, setSnapshot] = useState<ScoutWorkspaceSnapshot>(createEmptyWorkspace);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (!scoutId) {
      setSnapshot(createEmptyWorkspace());
      setIsHydrated(true);
      return;
    }

    setIsHydrated(false);
    void loadScoutWorkspace(scoutId).then((loaded) => {
      setSnapshot(loaded);
      setIsHydrated(true);
    });
  }, [scoutId]);

  const persistSnapshot = useCallback(
    (next: ScoutWorkspaceSnapshot) => {
      if (!scoutId) {
        return;
      }
      void saveScoutWorkspace(scoutId, next).catch(() => undefined);
    },
    [scoutId],
  );

  const updateSnapshot = useCallback(
    (updater: (current: ScoutWorkspaceSnapshot) => ScoutWorkspaceSnapshot) => {
      setSnapshot((current) => {
        const next = updater(current);
        persistSnapshot(next);
        return next;
      });
    },
    [persistSnapshot],
  );

  const recordPlayerView = useCallback(
    (playerId: string) => {
      updateSnapshot((current) => ({
        ...current,
        lastViewedPlayerId: playerId,
        recentlyViewedIds: [
          playerId,
          ...current.recentlyViewedIds.filter((id) => id !== playerId),
        ].slice(0, MAX_RECENTLY_VIEWED),
      }));
    },
    [updateSnapshot],
  );

  const recordSearch = useCallback(
    (term: string) => {
      const normalized = term.trim();
      if (!normalized) {
        return;
      }

      updateSnapshot((current) => ({
        ...current,
        recentSearches: [
          normalized,
          ...current.recentSearches.filter(
            (item) => item.toLowerCase() !== normalized.toLowerCase(),
          ),
        ].slice(0, MAX_RECENT_SEARCHES),
      }));
    },
    [updateSnapshot],
  );

  const clearRecentSearches = useCallback(() => {
    updateSnapshot((current) => ({ ...current, recentSearches: [] }));
  }, [updateSnapshot]);

  const saveFilterPreset = useCallback(
    (preset: FilterPreset) => {
      updateSnapshot((current) => {
        const withoutDuplicate = current.filterPresets.filter((item) => item.id !== preset.id);
        return {
          ...current,
          filterPresets: [preset, ...withoutDuplicate].slice(0, 8),
        };
      });
    },
    [updateSnapshot],
  );

  const removeFilterPreset = useCallback(
    (presetId: string) => {
      updateSnapshot((current) => ({
        ...current,
        filterPresets: current.filterPresets.filter((preset) => preset.id !== presetId),
      }));
    },
    [updateSnapshot],
  );

  const resolvePlayers = useCallback((ids: string[], pool: DiscoverablePlayer[]) => {
    const lookup = new Map(pool.map((player) => [player.id, player]));
    return ids.map((id) => lookup.get(id)).filter((player): player is DiscoverablePlayer => Boolean(player));
  }, []);

  const isInComparison = useCallback(
    (playerId: string) => snapshot.comparisonPlayerIds.includes(playerId),
    [snapshot.comparisonPlayerIds],
  );

  const canAddToComparison = snapshot.comparisonPlayerIds.length < MAX_COMPARISON_PLAYERS;

  const addToComparison = useCallback(
    (playerId: string) => {
      if (snapshot.comparisonPlayerIds.includes(playerId)) {
        return true;
      }
      if (snapshot.comparisonPlayerIds.length >= MAX_COMPARISON_PLAYERS) {
        return false;
      }
      updateSnapshot((current) => ({
        ...current,
        comparisonPlayerIds: [...current.comparisonPlayerIds, playerId],
      }));
      return true;
    },
    [snapshot.comparisonPlayerIds, updateSnapshot],
  );

  const removeFromComparison = useCallback(
    (playerId: string) => {
      updateSnapshot((current) => ({
        ...current,
        comparisonPlayerIds: current.comparisonPlayerIds.filter((id) => id !== playerId),
      }));
    },
    [updateSnapshot],
  );

  const replaceComparisonPlayer = useCallback(
    (currentId: string, nextId: string) => {
      if (currentId === nextId) {
        return;
      }
      updateSnapshot((current) => {
        const withoutDuplicate = current.comparisonPlayerIds.filter((id) => id !== nextId);
        return {
          ...current,
          comparisonPlayerIds: withoutDuplicate.map((id) =>
            id === currentId ? nextId : id,
          ),
        };
      });
    },
    [updateSnapshot],
  );

  const clearComparison = useCallback(() => {
    updateSnapshot((current) => ({ ...current, comparisonPlayerIds: [] }));
  }, [updateSnapshot]);

  const value = useMemo<ScoutWorkspaceContextValue>(
    () => ({
      isReady: isHydrated,
      recentlyViewedIds: snapshot.recentlyViewedIds,
      recentSearches: snapshot.recentSearches,
      filterPresets: snapshot.filterPresets,
      lastViewedPlayerId: snapshot.lastViewedPlayerId,
      comparisonPlayerIds: snapshot.comparisonPlayerIds,
      recordPlayerView,
      recordSearch,
      clearRecentSearches,
      saveFilterPreset,
      removeFilterPreset,
      resolvePlayers,
      addToComparison,
      removeFromComparison,
      replaceComparisonPlayer,
      clearComparison,
      isInComparison,
      canAddToComparison,
    }),
    [
      addToComparison,
      canAddToComparison,
      clearComparison,
      clearRecentSearches,
      isInComparison,
      isHydrated,
      recordPlayerView,
      recordSearch,
      removeFromComparison,
      removeFilterPreset,
      replaceComparisonPlayer,
      resolvePlayers,
      saveFilterPreset,
      snapshot,
    ],
  );

  return (
    <ScoutWorkspaceContext.Provider value={value}>{children}</ScoutWorkspaceContext.Provider>
  );
}

export function useScoutWorkspace(): ScoutWorkspaceContextValue {
  const context = useContext(ScoutWorkspaceContext);
  if (!context) {
    throw new Error('useScoutWorkspace must be used within ScoutWorkspaceProvider');
  }
  return context;
}

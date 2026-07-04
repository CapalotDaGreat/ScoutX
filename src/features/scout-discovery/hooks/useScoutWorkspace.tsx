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
    favouriteIds: [],
    recentlyViewedIds: [],
    recentSearches: [],
    filterPresets: DEFAULT_FILTER_PRESETS,
    lastViewedPlayerId: null,
  };
}

const MAX_RECENT_SEARCHES = 6;
const MAX_RECENTLY_VIEWED = 12;

type ScoutWorkspaceContextValue = {
  isReady: boolean;
  favouriteIds: string[];
  recentlyViewedIds: string[];
  recentSearches: string[];
  filterPresets: FilterPreset[];
  lastViewedPlayerId: string | null;
  isFavourite: (playerId: string) => boolean;
  toggleFavourite: (playerId: string) => void;
  recordPlayerView: (playerId: string) => void;
  recordSearch: (term: string) => void;
  clearRecentSearches: () => void;
  saveFilterPreset: (preset: FilterPreset) => void;
  removeFilterPreset: (presetId: string) => void;
  resolvePlayers: (ids: string[], pool: DiscoverablePlayer[]) => DiscoverablePlayer[];
};

const ScoutWorkspaceContext = createContext<ScoutWorkspaceContextValue | null>(null);

function persistSnapshot(snapshot: ScoutWorkspaceSnapshot) {
  void saveScoutWorkspace(snapshot).catch(() => undefined);
}

export function ScoutWorkspaceProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<ScoutWorkspaceSnapshot>(createEmptyWorkspace);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    void loadScoutWorkspace().then((loaded) => {
      setSnapshot(loaded);
      setIsHydrated(true);
    });
  }, []);

  const updateSnapshot = useCallback((updater: (current: ScoutWorkspaceSnapshot) => ScoutWorkspaceSnapshot) => {
    setSnapshot((current) => {
      const next = updater(current);
      persistSnapshot(next);
      return next;
    });
  }, []);

  const isFavourite = useCallback(
    (playerId: string) => snapshot.favouriteIds.includes(playerId),
    [snapshot.favouriteIds],
  );

  const toggleFavourite = useCallback(
    (playerId: string) => {
      updateSnapshot((current) => {
        const exists = current.favouriteIds.includes(playerId);
        return {
          ...current,
          favouriteIds: exists
            ? current.favouriteIds.filter((id) => id !== playerId)
            : [playerId, ...current.favouriteIds],
        };
      });
    },
    [updateSnapshot],
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

  const value = useMemo<ScoutWorkspaceContextValue>(
    () => ({
      isReady: isHydrated,
      favouriteIds: snapshot.favouriteIds,
      recentlyViewedIds: snapshot.recentlyViewedIds,
      recentSearches: snapshot.recentSearches,
      filterPresets: snapshot.filterPresets,
      lastViewedPlayerId: snapshot.lastViewedPlayerId,
      isFavourite,
      toggleFavourite,
      recordPlayerView,
      recordSearch,
      clearRecentSearches,
      saveFilterPreset,
      removeFilterPreset,
      resolvePlayers,
    }),
    [
      clearRecentSearches,
      isFavourite,
      recordPlayerView,
      recordSearch,
      removeFilterPreset,
      resolvePlayers,
      saveFilterPreset,
      snapshot,
      toggleFavourite,
      isHydrated,
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

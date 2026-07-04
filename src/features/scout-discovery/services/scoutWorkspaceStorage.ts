import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_FILTER_PRESETS, SCOUT_WORKSPACE_STORAGE_KEY } from '@/features/scout-discovery/constants';
import { type ScoutWorkspaceSnapshot } from '@/features/scout-discovery/types';

const emptyWorkspace = (): ScoutWorkspaceSnapshot => ({
  favouriteIds: [],
  recentlyViewedIds: [],
  recentSearches: [],
  filterPresets: DEFAULT_FILTER_PRESETS,
  lastViewedPlayerId: null,
});

function normalizeWorkspace(value: unknown): ScoutWorkspaceSnapshot {
  const base = emptyWorkspace();
  if (!value || typeof value !== 'object') {
    return base;
  }

  const record = value as Partial<ScoutWorkspaceSnapshot>;
  return {
    favouriteIds: Array.isArray(record.favouriteIds)
      ? record.favouriteIds.filter((id): id is string => typeof id === 'string')
      : base.favouriteIds,
    recentlyViewedIds: Array.isArray(record.recentlyViewedIds)
      ? record.recentlyViewedIds.filter((id): id is string => typeof id === 'string')
      : base.recentlyViewedIds,
    recentSearches: Array.isArray(record.recentSearches)
      ? record.recentSearches.filter((term): term is string => typeof term === 'string')
      : base.recentSearches,
    filterPresets: Array.isArray(record.filterPresets) ? record.filterPresets : base.filterPresets,
    lastViewedPlayerId:
      typeof record.lastViewedPlayerId === 'string' ? record.lastViewedPlayerId : null,
  };
}

export async function loadScoutWorkspace(): Promise<ScoutWorkspaceSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(SCOUT_WORKSPACE_STORAGE_KEY);
    if (!raw) {
      return emptyWorkspace();
    }
    return normalizeWorkspace(JSON.parse(raw));
  } catch {
    return emptyWorkspace();
  }
}

export async function saveScoutWorkspace(snapshot: ScoutWorkspaceSnapshot): Promise<void> {
  await AsyncStorage.setItem(SCOUT_WORKSPACE_STORAGE_KEY, JSON.stringify(snapshot));
}

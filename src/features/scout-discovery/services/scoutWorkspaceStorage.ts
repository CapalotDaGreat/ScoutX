import { DEFAULT_FILTER_PRESETS, SCOUT_WORKSPACE_STORAGE_KEY } from '@/features/scout-discovery/constants';
import { MAX_COMPARISON_PLAYERS } from '@/features/player-comparison/constants';
import { type ScoutWorkspaceSnapshot } from '@/features/scout-discovery/types';
import {
  loadScopedValue,
  migrateLegacyScopedValue,
  saveScopedValue,
} from '@/data/scopedAsyncStorage';

const emptyWorkspace = (): ScoutWorkspaceSnapshot => ({
  recentlyViewedIds: [],
  recentSearches: [],
  filterPresets: DEFAULT_FILTER_PRESETS,
  lastViewedPlayerId: null,
  comparisonPlayerIds: [],
});

function isLegacyWorkspaceSnapshot(value: unknown): value is ScoutWorkspaceSnapshot & {
  favouriteIds?: string[];
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Partial<ScoutWorkspaceSnapshot & { favouriteIds?: string[] }>;
  return (
    Array.isArray(record.recentlyViewedIds) ||
    Array.isArray(record.recentSearches) ||
    Array.isArray(record.comparisonPlayerIds) ||
    Array.isArray(record.favouriteIds)
  );
}

function normalizeWorkspace(value: unknown): ScoutWorkspaceSnapshot | null {
  const base = emptyWorkspace();
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Partial<ScoutWorkspaceSnapshot & { favouriteIds?: string[] }>;
  return {
    recentlyViewedIds: Array.isArray(record.recentlyViewedIds)
      ? record.recentlyViewedIds.filter((id): id is string => typeof id === 'string')
      : base.recentlyViewedIds,
    recentSearches: Array.isArray(record.recentSearches)
      ? record.recentSearches.filter((term): term is string => typeof term === 'string')
      : base.recentSearches,
    filterPresets: Array.isArray(record.filterPresets) ? record.filterPresets : base.filterPresets,
    lastViewedPlayerId:
      typeof record.lastViewedPlayerId === 'string' ? record.lastViewedPlayerId : null,
    comparisonPlayerIds: Array.isArray(record.comparisonPlayerIds)
      ? record.comparisonPlayerIds
          .filter((id): id is string => typeof id === 'string')
          .slice(0, MAX_COMPARISON_PLAYERS)
      : base.comparisonPlayerIds,
  };
}

export async function loadScoutWorkspace(scoutId: string): Promise<ScoutWorkspaceSnapshot> {
  const migrated = await migrateLegacyScopedValue(
    SCOUT_WORKSPACE_STORAGE_KEY,
    scoutId,
    isLegacyWorkspaceSnapshot,
    normalizeWorkspace,
  );
  if (migrated) {
    return migrated;
  }

  return loadScopedValue(
    SCOUT_WORKSPACE_STORAGE_KEY,
    scoutId,
    normalizeWorkspace,
    emptyWorkspace,
  );
}

export async function saveScoutWorkspace(
  scoutId: string,
  snapshot: ScoutWorkspaceSnapshot,
): Promise<void> {
  await saveScopedValue(SCOUT_WORKSPACE_STORAGE_KEY, scoutId, snapshot);
}

import { DEFAULT_FILTER_PRESETS, SCOUT_WORKSPACE_STORAGE_KEY } from '@/features/scout-discovery/constants';
import { MAX_COMPARISON_PLAYERS } from '@/features/player-comparison/constants';
import {
  type DiscoverySearchScope,
  type FilterPreset,
  type RecentSearchEntry,
  type ScoutWorkspaceSnapshot,
} from '@/features/scout-discovery/types';
import {
  loadScopedValue,
  migrateLegacyScopedValue,
  saveScopedValue,
} from '@/data/scopedAsyncStorage';

const SEARCH_SCOPES: DiscoverySearchScope[] = [
  'all',
  'name',
  'club',
  'position',
  'nationality',
  'league',
];

const emptyWorkspace = (): ScoutWorkspaceSnapshot => ({
  recentlyViewedIds: [],
  recentSearches: [],
  filterPresets: DEFAULT_FILTER_PRESETS,
  lastViewedPlayerId: null,
  comparisonPlayerIds: [],
});

function isSearchScope(value: unknown): value is DiscoverySearchScope {
  return typeof value === 'string' && SEARCH_SCOPES.includes(value as DiscoverySearchScope);
}

function normalizeRecentSearches(value: unknown): RecentSearchEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries: RecentSearchEntry[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      entries.push({
        term: item.trim(),
        scope: 'all',
        searchedAt: new Date(0).toISOString(),
      });
      continue;
    }
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Partial<RecentSearchEntry>;
    if (typeof record.term !== 'string' || !record.term.trim()) {
      continue;
    }
    entries.push({
      term: record.term.trim(),
      scope: isSearchScope(record.scope) ? record.scope : 'all',
      searchedAt:
        typeof record.searchedAt === 'string' ? record.searchedAt : new Date(0).toISOString(),
    });
  }
  return entries;
}

function normalizeFilterPresets(value: unknown): FilterPreset[] {
  if (!Array.isArray(value) || value.length === 0) {
    return DEFAULT_FILTER_PRESETS;
  }

  const presets = value.filter((item): item is FilterPreset => {
    if (!item || typeof item !== 'object') {
      return false;
    }
    const record = item as Partial<FilterPreset>;
    return (
      typeof record.id === 'string' &&
      typeof record.name === 'string' &&
      Boolean(record.filters) &&
      typeof record.sort === 'string'
    );
  });

  return presets.length > 0 ? presets : DEFAULT_FILTER_PRESETS;
}

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
    recentSearches: normalizeRecentSearches(record.recentSearches),
    filterPresets: normalizeFilterPresets(record.filterPresets),
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

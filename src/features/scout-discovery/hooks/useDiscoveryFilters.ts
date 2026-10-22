import { useCallback, useMemo, useState } from 'react';
import {
  defaultDiscoveryFilters,
  type DiscoveryFilters,
  type DiscoverySortOption,
  type FilterPreset,
} from '@/features/scout-discovery/types';
import {
  countActiveFilters,
  normalizeDiscoverySort,
} from '@/features/scout-discovery/services/discoveryQueryService';

export function useDiscoveryFilters(initial?: Partial<{ filters: DiscoveryFilters; sort: DiscoverySortOption }>) {
  const [filters, setFilters] = useState<DiscoveryFilters>(initial?.filters ?? defaultDiscoveryFilters);
  const [sort, setSortState] = useState<DiscoverySortOption>(normalizeDiscoverySort(initial?.sort ?? 'recently_updated'));
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

  const updateFilter = useCallback(
    <Key extends keyof DiscoveryFilters>(key: Key, value: DiscoveryFilters[Key]) => {
      setActivePresetId(null);
      setFilters((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const setAllFilters = useCallback((next: DiscoveryFilters) => {
    setActivePresetId(null);
    setFilters(next);
  }, []);

  const resetFilters = useCallback(() => {
    setActivePresetId(null);
    setFilters(defaultDiscoveryFilters);
  }, []);

  const setSort = useCallback((next: DiscoverySortOption) => {
    setSortState(normalizeDiscoverySort(next));
  }, []);

  const applyPreset = useCallback((preset: FilterPreset) => {
    setFilters(preset.filters);
    setSort(preset.sort);
    setActivePresetId(preset.id);
  }, [setSort]);

  return {
    filters,
    sort,
    activeFilterCount,
    activePresetId,
    updateFilter,
    setSort,
    resetFilters,
    setFilters: setAllFilters,
    applyPreset,
    setActivePresetId,
  };
}

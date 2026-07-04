import { useCallback, useMemo, useState } from 'react';
import {
  defaultDiscoveryFilters,
  type DiscoveryFilters,
  type DiscoverySortOption,
  type FilterPreset,
} from '@/features/scout-discovery/types';
import { countActiveFilters } from '@/features/scout-discovery/services/discoveryQueryService';

export function useDiscoveryFilters(initial?: Partial<{ filters: DiscoveryFilters; sort: DiscoverySortOption }>) {
  const [filters, setFilters] = useState<DiscoveryFilters>(initial?.filters ?? defaultDiscoveryFilters);
  const [sort, setSort] = useState<DiscoverySortOption>(initial?.sort ?? 'overall');
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

  const applyPreset = useCallback((preset: FilterPreset) => {
    setFilters(preset.filters);
    setSort(preset.sort);
    setActivePresetId(preset.id);
  }, []);

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

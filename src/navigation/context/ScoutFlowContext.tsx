import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useDiscoveryFilters } from '@/features/scout-discovery/hooks/useDiscoveryFilters';
import { useScoutWorkspace } from '@/features/scout-discovery/hooks/useScoutWorkspace';
import {
  type DiscoverySearchScope,
  type FilterPreset,
} from '@/features/scout-discovery/types';

type ScoutFlowContextValue = ReturnType<typeof useDiscoveryFilters> & {
  search: string;
  setSearch: (value: string) => void;
  searchScope: DiscoverySearchScope;
  setSearchScope: (scope: DiscoverySearchScope) => void;
  recordSearchSubmit: () => void;
  saveCurrentFilterPreset: (name: string, includeSearch: boolean) => void;
  openPlayerDetail: (playerId: string) => void;
  setOpenPlayerDetail: (handler: (playerId: string) => void) => void;
};

const ScoutFlowContext = createContext<ScoutFlowContextValue | null>(null);

export function ScoutFlowProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState('');
  const [searchScope, setSearchScope] = useState<DiscoverySearchScope>('all');
  const discovery = useDiscoveryFilters();
  const workspace = useScoutWorkspace();
  const [openPlayerDetailHandler, setOpenPlayerDetailHandler] = useState<
    (playerId: string) => void
  >(() => () => undefined);

  const recordSearchSubmit = useCallback(() => {
    if (search.trim()) {
      workspace.recordSearch(search, searchScope);
    }
  }, [search, searchScope, workspace]);

  const saveCurrentFilterPreset = useCallback(
    (name: string, includeSearch: boolean) => {
      const preset: FilterPreset = {
        id: `preset-custom-${Date.now()}`,
        name: name.trim(),
        filters: discovery.filters,
        sort: discovery.sort,
        ...(includeSearch
          ? {
              search: search.trim(),
              searchScope,
            }
          : {}),
      };
      workspace.saveFilterPreset(preset);
      discovery.setActivePresetId(preset.id);
    },
    [discovery, search, searchScope, workspace],
  );

  const openPlayerDetail = useCallback(
    (playerId: string) => {
      openPlayerDetailHandler(playerId);
    },
    [openPlayerDetailHandler],
  );

  const setOpenPlayerDetail = useCallback((handler: (playerId: string) => void) => {
    setOpenPlayerDetailHandler(() => handler);
  }, []);

  const value = useMemo<ScoutFlowContextValue>(
    () => ({
      ...discovery,
      search,
      setSearch,
      searchScope,
      setSearchScope,
      recordSearchSubmit,
      saveCurrentFilterPreset,
      openPlayerDetail,
      setOpenPlayerDetail,
    }),
    [
      discovery,
      openPlayerDetail,
      recordSearchSubmit,
      saveCurrentFilterPreset,
      search,
      searchScope,
      setOpenPlayerDetail,
    ],
  );

  return <ScoutFlowContext.Provider value={value}>{children}</ScoutFlowContext.Provider>;
}

export function useScoutFlow(): ScoutFlowContextValue {
  const context = useContext(ScoutFlowContext);
  if (!context) {
    throw new Error('useScoutFlow must be used within ScoutFlowProvider');
  }
  return context;
}

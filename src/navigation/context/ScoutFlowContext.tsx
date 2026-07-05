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
import { type FilterPreset } from '@/features/scout-discovery/types';

type ScoutFlowContextValue = ReturnType<typeof useDiscoveryFilters> & {
  search: string;
  setSearch: (value: string) => void;
  recordSearchSubmit: () => void;
  saveCurrentFilterPreset: () => void;
  openPlayerDetail: (playerId: string) => void;
  setOpenPlayerDetail: (handler: (playerId: string) => void) => void;
};

const ScoutFlowContext = createContext<ScoutFlowContextValue | null>(null);

export function ScoutFlowProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState('');
  const discovery = useDiscoveryFilters();
  const workspace = useScoutWorkspace();
  const [openPlayerDetailHandler, setOpenPlayerDetailHandler] = useState<
    (playerId: string) => void
  >(() => () => undefined);

  const recordSearchSubmit = useCallback(() => {
    if (search.trim()) {
      workspace.recordSearch(search);
    }
  }, [search, workspace]);

  const saveCurrentFilterPreset = useCallback(() => {
    const preset: FilterPreset = {
      id: `preset-custom-${Date.now()}`,
      name: `Preset ${workspace.filterPresets.length + 1}`,
      filters: discovery.filters,
      sort: discovery.sort,
    };
    workspace.saveFilterPreset(preset);
  }, [discovery.filters, discovery.sort, workspace]);

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

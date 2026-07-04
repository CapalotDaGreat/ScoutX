import { useMemo } from 'react';
import { mockDiscoverablePlayers } from '@/features/scout-discovery/services/mockPlayerDiscoveryData';
import { useScoutWorkspace } from '@/features/scout-discovery/hooks/useScoutWorkspace';
import {
  buildComparisonProfiles,
  mergeTrendPoints,
} from '@/features/player-comparison/services/comparisonProfileService';
import {
  buildGpsRows,
  buildPhysicalRows,
  buildStatisticsRows,
  buildTechnicalRows,
} from '@/features/player-comparison/services/comparisonMetricsService';
import { MAX_COMPARISON_PLAYERS } from '@/features/player-comparison/constants';

export function usePlayerComparison() {
  const workspace = useScoutWorkspace();
  const {
    comparisonPlayerIds,
    addToComparison,
    removeFromComparison,
    replaceComparisonPlayer,
    clearComparison,
    isInComparison,
    canAddToComparison,
  } = workspace;

  const players = useMemo(
    () => workspace.resolvePlayers(comparisonPlayerIds, mockDiscoverablePlayers),
    [comparisonPlayerIds, workspace],
  );

  const profiles = useMemo(() => buildComparisonProfiles(players), [players]);

  const mergedTrends = useMemo(() => mergeTrendPoints(profiles), [profiles]);

  const statisticsRows = useMemo(() => buildStatisticsRows(profiles), [profiles]);
  const physicalRows = useMemo(() => buildPhysicalRows(profiles), [profiles]);
  const technicalRows = useMemo(() => buildTechnicalRows(profiles), [profiles]);
  const gpsRows = useMemo(() => buildGpsRows(profiles), [profiles]);

  return {
    comparisonPlayerIds,
    players,
    profiles,
    mergedTrends,
    statisticsRows,
    physicalRows,
    technicalRows,
    gpsRows,
    maxPlayers: MAX_COMPARISON_PLAYERS,
    addToComparison,
    removeFromComparison,
    replaceComparisonPlayer,
    clearComparison,
    isInComparison,
    canAddToComparison,
    playerPool: mockDiscoverablePlayers,
  };
}

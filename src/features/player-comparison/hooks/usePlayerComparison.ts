import { useMemo } from 'react';
import { useDiscoverablePlayerPool } from '@/features/scout-discovery/hooks/useDiscoverablePlayerPool';
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
  selectStatisticRows,
} from '@/features/player-comparison/services/comparisonMetricsService';
import { MAX_COMPARISON_PLAYERS } from '@/features/player-comparison/constants';
import {
  comparisonSectionsForGroup,
  sharedPositionGroup,
  statisticKeysForGroup,
} from '@/features/scout-intelligence/services/positionComparison';

export function usePlayerComparison() {
  const workspace = useScoutWorkspace();
  const { players: playerPool } = useDiscoverablePlayerPool();
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
    () => workspace.resolvePlayers(comparisonPlayerIds, playerPool),
    [comparisonPlayerIds, playerPool, workspace],
  );

  const profiles = useMemo(() => buildComparisonProfiles(players), [players]);

  const mergedTrends = useMemo(() => mergeTrendPoints(profiles), [profiles]);

  const statisticsRows = useMemo(() => {
    const rows = buildStatisticsRows(profiles);
    const group = sharedPositionGroup(players);
    return selectStatisticRows(rows, statisticKeysForGroup(group));
  }, [players, profiles]);
  const physicalRows = useMemo(() => buildPhysicalRows(profiles), [profiles]);
  const technicalRows = useMemo(() => buildTechnicalRows(profiles), [profiles]);
  const gpsRows = useMemo(() => buildGpsRows(profiles), [profiles]);
  const visibleSections = useMemo(
    () => comparisonSectionsForGroup(sharedPositionGroup(players)),
    [players],
  );

  return {
    comparisonPlayerIds,
    players,
    profiles,
    mergedTrends,
    statisticsRows,
    physicalRows,
    technicalRows,
    gpsRows,
    visibleSections,
    maxPlayers: MAX_COMPARISON_PLAYERS,
    addToComparison,
    removeFromComparison,
    replaceComparisonPlayer,
    clearComparison,
    isInComparison,
    canAddToComparison,
    playerPool,
  };
}

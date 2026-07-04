import { useEffect, useMemo, useState } from 'react';
import { calculatePlayerStatistics } from '@/features/player-statistics/services/statisticsCalculator';
import { getMockPlayerStatistics } from '@/features/player-statistics/services/mockPlayerStatisticsService';
import { mapMatchesToProfileStats } from '@/features/player-statistics/utils/profileStatsMapper';
import {
  type PlayerMatchStatistics,
  type PlayerStatisticsOverview,
} from '@/features/player-statistics/types';
import { type PlayerProfileStat } from '@/features/player-profile/types';

export type UsePlayerStatisticsOptions = {
  matches?: PlayerMatchStatistics[];
};

export function usePlayerStatistics({ matches }: UsePlayerStatisticsOptions = {}) {
  const [loadedMatches, setLoadedMatches] = useState<PlayerMatchStatistics[]>(matches ?? []);
  const [isLoading, setIsLoading] = useState(!matches);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (matches) {
      setLoadedMatches(matches);
      setIsLoading(false);
      setError(null);
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setError(null);

    getMockPlayerStatistics()
      .then((nextMatches) => {
        if (isActive) {
          setLoadedMatches(nextMatches);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isActive) {
          const message = err instanceof Error ? err.message : 'Unable to load statistics.';
          setError(message);
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [matches]);

  const overview = useMemo<PlayerStatisticsOverview>(
    () => calculatePlayerStatistics(loadedMatches),
    [loadedMatches],
  );

  const profileStats = useMemo<PlayerProfileStat[]>(
    () => mapMatchesToProfileStats(loadedMatches),
    [loadedMatches],
  );

  return useMemo(
    () => ({
      overview,
      matches: loadedMatches,
      profileStats,
      isLoading,
      error,
    }),
    [error, isLoading, loadedMatches, overview, profileStats],
  );
}

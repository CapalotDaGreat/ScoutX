import { useCallback, useEffect, useState } from 'react';
import { PlayerDiscoveryRepository } from '@/features/scout-discovery/repositories/PlayerDiscoveryRepository';
import { type ScoutDashboardData } from '@/features/scout-discovery/types';

export function useScoutDashboard() {
  const [data, setData] = useState<ScoutDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const repository = PlayerDiscoveryRepository.getInstance();
      const dashboard = await repository.fetchDashboard();
      setData(dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, isLoading, error, refresh };
}

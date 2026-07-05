import { useCallback, useEffect, useState } from 'react';
import { useMockData } from '@/config/appMode';
import { GpsSessionRepository } from '@/features/gps/repositories/GpsSessionRepository';
import { getMockGpsSessions } from '@/features/gps/services/mockGpsSessionService';
import { type GpsSession } from '@/features/gps/types';

export type UseGpsSessionsOptions = {
  playerId: string | null;
};

export function useGpsSessions({ playerId }: UseGpsSessionsOptions) {
  const [sessions, setSessions] = useState<GpsSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSessions = useCallback(async () => {
    if (!playerId) {
      setSessions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const repository = GpsSessionRepository.getInstance();
      const nextSessions = await repository.fetchSessions(playerId);
      setSessions(
        nextSessions.length > 0
          ? nextSessions
          : useMockData()
            ? await getMockGpsSessions(playerId)
            : [],
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load GPS sessions.';
      setError(message);
      setSessions(useMockData() ? await getMockGpsSessions(playerId) : []);
    } finally {
      setIsLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  return {
    sessions,
    isLoading,
    error,
    refreshSessions,
  };
}

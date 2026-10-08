import { useEffect, useState } from 'react';
import { type ExternalFootballSource } from '@/features/football-sources/core';
import { subscribeToOwnFootballSources } from '@/features/football-sources/repositories/FootballSourceRepository';

export function useOwnFootballSources(uid: string | null | undefined) {
  const [sources, setSources] = useState<ExternalFootballSource[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(uid));
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!uid) {
      setSources([]);
      setIsLoading(false);
      return undefined;
    }
    setIsLoading(true);
    return subscribeToOwnFootballSources(
      uid,
      (next) => {
        setSources(next);
        setHasError(false);
        setIsLoading(false);
      },
      () => {
        setHasError(true);
        setIsLoading(false);
      },
    );
  }, [uid]);

  return { sources, isLoading, hasError };
}

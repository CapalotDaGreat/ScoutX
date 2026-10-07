import { useEffect, useState } from 'react';
import { PublicPortfolioRepository } from '@/features/public-portfolio/repositories/PublicPortfolioRepository';
import type { PublicPortfolioData } from '@/features/public-portfolio/types';

/** Loads the server projection strangers receive, for the owner's privacy preview. */
export function useStrangerView(playerId: string | null, enabled: boolean) {
  const [data, setData] = useState<PublicPortfolioData | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled || !playerId) {
      setData(null);
      setIsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setIsLoading(true);
    void PublicPortfolioRepository.getInstance()
      .fetchStrangerView(playerId)
      .then((view) => {
        if (!cancelled) setData(view);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, playerId]);

  return { data, isLoading };
}

import { useCallback, useEffect, useState } from 'react';
import { PublicPortfolioRepository } from '@/features/public-portfolio/repositories/PublicPortfolioRepository';
import { type PublicPortfolioData } from '@/features/public-portfolio/types';
import { toUserMessage } from '@/utils/userFacingError';

export function usePublicPortfolio(playerId: string | null) {
  const [data, setData] = useState<PublicPortfolioData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!playerId) {
      setData(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const portfolio = await PublicPortfolioRepository.getInstance().fetchPublicPortfolio(playerId);
      if (!portfolio) {
        setError('This portfolio is private or unavailable.');
        setData(null);
      } else {
        setData(portfolio);
      }
    } catch (err) {
      setError(toUserMessage(err, 'Unable to load portfolio.'));
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, isLoading, error, refresh };
}

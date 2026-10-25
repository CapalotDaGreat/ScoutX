import { useCallback, useEffect, useState } from 'react';
import { PublicPortfolioRepository } from '@/features/public-portfolio/repositories/PublicPortfolioRepository';
import { type PublicPortfolioData } from '@/features/public-portfolio/types';
import { toUserMessage } from '@/utils/userFacingError';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export function usePublicPortfolio(playerId: string | null) {
  const { t } = useAppTranslation('portfolio');
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
        setError(t('publicUi.resolveError.not_found'));
        setData(null);
      } else {
        setData(portfolio);
      }
    } catch (err) {
      setError(toUserMessage(err, t('publicUi.resolveError.failed')));
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [playerId, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, isLoading, error, refresh };
}

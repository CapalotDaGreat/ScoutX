import { useEffect, useState } from 'react';
import { PortfolioSlugRepository } from '@/features/public-portfolio/repositories/PortfolioSlugRepository';
import { isReservedUsername } from '@/features/public-portfolio/services/usernameService';

export type PassportResolveError = 'missing' | 'app_route' | 'not_found' | 'failed';

export function useResolvedPlayerId(playerId?: string, slug?: string) {
  const [resolvedPlayerId, setResolvedPlayerId] = useState<string | null>(playerId ?? null);
  const [isResolving, setIsResolving] = useState(Boolean(slug && !playerId));
  const [resolveError, setResolveError] = useState<PassportResolveError | null>(null);

  useEffect(() => {
    if (playerId) {
      setResolvedPlayerId(playerId);
      setIsResolving(false);
      setResolveError(null);
      return;
    }

    if (!slug) {
      setResolvedPlayerId(null);
      setIsResolving(false);
      setResolveError('missing');
      return;
    }

    if (isReservedUsername(slug)) {
      setResolvedPlayerId(null);
      setIsResolving(false);
      setResolveError('app_route');
      return;
    }

    setIsResolving(true);
    void PortfolioSlugRepository.getInstance()
      .resolvePlayerId(slug)
      .then((id) => {
        if (!id) {
          setResolveError('not_found');
          setResolvedPlayerId(null);
        } else {
          setResolvedPlayerId(id);
          setResolveError(null);
        }
      })
      .catch(() => {
        setResolveError('failed');
        setResolvedPlayerId(null);
      })
      .finally(() => setIsResolving(false));
  }, [playerId, slug]);

  return { resolvedPlayerId, isResolving, resolveError };
}

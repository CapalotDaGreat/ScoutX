import { useEffect, useState } from 'react';
import { PortfolioSlugRepository } from '@/features/public-portfolio/repositories/PortfolioSlugRepository';
import { isReservedUsername } from '@/features/public-portfolio/services/usernameService';

export function useResolvedPlayerId(playerId?: string, slug?: string) {
  const [resolvedPlayerId, setResolvedPlayerId] = useState<string | null>(playerId ?? null);
  const [isResolving, setIsResolving] = useState(Boolean(slug && !playerId));
  const [resolveError, setResolveError] = useState<string | null>(null);

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
      setResolveError('Missing portfolio identifier.');
      return;
    }

    if (isReservedUsername(slug)) {
      setResolvedPlayerId(null);
      setIsResolving(false);
      setResolveError('This link points to an app route, not a player username.');
      return;
    }

    setIsResolving(true);
    void PortfolioSlugRepository.getInstance()
      .resolvePlayerId(slug)
      .then((id) => {
        if (!id) {
          setResolveError('Football Passport not found.');
          setResolvedPlayerId(null);
        } else {
          setResolvedPlayerId(id);
          setResolveError(null);
        }
      })
      .catch(() => {
        setResolveError('Unable to resolve Football Passport.');
        setResolvedPlayerId(null);
      })
      .finally(() => setIsResolving(false));
  }, [playerId, slug]);

  return { resolvedPlayerId, isResolving, resolveError };
}

import { useCallback, useEffect, useState } from 'react';
import { PlayerDiscoveryRepository } from '@/features/scout-discovery/repositories/PlayerDiscoveryRepository';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';
import { toUserMessage } from '@/utils/userFacingError';

export function usePlayerDetail(playerId: string | null) {
  const [player, setPlayer] = useState<DiscoverablePlayer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!playerId) {
      setPlayer(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const repository = PlayerDiscoveryRepository.getInstance();
      const result = await repository.fetchPlayerById(playerId);
      if (!result) {
        setError('Player not found.');
        setPlayer(null);
        return;
      }
      setPlayer(result);
    } catch (err) {
      setError(toUserMessage(err, 'Failed to load player.'));
    } finally {
      setIsLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { player, isLoading, error, reload: load };
}

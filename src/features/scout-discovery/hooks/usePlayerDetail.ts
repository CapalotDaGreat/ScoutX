import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayerDiscoveryRepository } from '@/features/scout-discovery/repositories/PlayerDiscoveryRepository';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';
import { toUserMessage } from '@/utils/userFacingError';

export function usePlayerDetail(playerId: string | null) {
  const [player, setPlayer] = useState<DiscoverablePlayer | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(playerId));
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!playerId) {
      setPlayer(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setPlayer(null);

    try {
      const repository = PlayerDiscoveryRepository.getInstance();
      const result = await repository.fetchPlayerById(playerId);
      if (version !== requestVersion.current) return;
      if (!result) {
        setError('Player not found.');
        setPlayer(null);
        return;
      }
      setPlayer(result);
    } catch (err) {
      if (version !== requestVersion.current) return;
      setError(toUserMessage(err, 'Failed to load player.'));
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    void load();
    return () => { requestVersion.current += 1; };
  }, [load]);

  return { player: player?.id === playerId ? player : null, isLoading, error, reload: load };
}

import { useEffect, useState } from 'react';
import { PlayerDiscoveryRepository } from '@/features/scout-discovery/repositories/PlayerDiscoveryRepository';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';

export function useDiscoverablePlayerPool(limit = 100): {
  players: DiscoverablePlayer[];
  isLoading: boolean;
  reload: () => void;
} {
  const [players, setPlayers] = useState<DiscoverablePlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    void PlayerDiscoveryRepository.getInstance()
      .fetchAllDiscoverablePlayers(limit)
      .then((next) => {
        if (!cancelled) {
          setPlayers(next);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [limit, reloadToken]);

  return {
    players,
    isLoading,
    reload: () => setReloadToken((value) => value + 1),
  };
}

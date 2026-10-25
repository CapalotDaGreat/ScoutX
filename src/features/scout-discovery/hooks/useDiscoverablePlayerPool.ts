import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useBlockedUsers } from '@/features/trust-safety/hooks/useBlockedUsers';
import { visibleForViewer } from '@/features/trust-safety/services/blockedUserState';
import { toUserMessage } from '@/utils/userFacingError';
import { PlayerDiscoveryRepository } from '@/features/scout-discovery/repositories/PlayerDiscoveryRepository';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';

export function useDiscoverablePlayerPool(limit = 100): {
  players: DiscoverablePlayer[];
  isLoading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [players, setPlayers] = useState<DiscoverablePlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const { blockedIds, isReady: blocksReady, error: blocksError, refresh: refreshBlocks } = useBlockedUsers(user?.id ?? null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void PlayerDiscoveryRepository.getInstance()
      .fetchAllDiscoverablePlayers(limit)
      .then((next) => {
        if (!cancelled) {
          setPlayers(next);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setPlayers([]);
          setError(toUserMessage(cause, 'Related players could not be loaded.'));
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

  const visiblePlayers = useMemo(() => visibleForViewer(players, blockedIds, blocksReady), [players, blockedIds, blocksReady]);
  return {
    players: visiblePlayers,
    isLoading: isLoading || (!blocksReady && !blocksError),
    error: blocksError ? 'Blocked players could not be checked.' : error,
    reload: () => { setReloadToken((value) => value + 1); void refreshBlocks(); },
  };
}

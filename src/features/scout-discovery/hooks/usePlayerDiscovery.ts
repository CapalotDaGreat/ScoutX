import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useBlockedUsers } from '@/features/trust-safety/hooks/useBlockedUsers';
import { PlayerDiscoveryRepository } from '@/features/scout-discovery/repositories/PlayerDiscoveryRepository';
import {
  type DiscoverablePlayer,
  type DiscoveryFilters,
  type DiscoverySortOption,
} from '@/features/scout-discovery/types';

export type UsePlayerDiscoveryOptions = {
  search: string;
  filters: DiscoveryFilters;
  sort: DiscoverySortOption;
  enabled?: boolean;
};

export function usePlayerDiscovery({
  search,
  filters,
  sort,
  enabled = true,
}: UsePlayerDiscoveryOptions) {
  const { user } = useAuth();
  const { blockedIds } = useBlockedUsers(user?.id ?? null);
  const [players, setPlayers] = useState<DiscoverablePlayer[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const discoveryQuery = useMemo(
    () => ({ search: debouncedSearch, filters, sort }),
    [debouncedSearch, filters, sort],
  );

  const loadPage = useCallback(
    async (nextCursor: string | null, append: boolean) => {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const repository = PlayerDiscoveryRepository.getInstance();
        const result = await repository.fetchPlayersPage(discoveryQuery, nextCursor);
        const visiblePlayers = result.players.filter((player) => !blockedIds.has(player.id));

        setPlayers((current) =>
          append ? [...current, ...visiblePlayers] : visiblePlayers,
        );
        setCursor(result.nextCursor);
        setHasMore(result.hasMore);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load players.');
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [blockedIds, discoveryQuery],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void loadPage(null, false);
  }, [enabled, loadPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || isLoading) {
      return;
    }
    void loadPage(cursor, true);
  }, [cursor, hasMore, isLoading, isLoadingMore, loadPage]);

  const refresh = useCallback(() => {
    void loadPage(null, false);
  }, [loadPage]);

  return {
    players,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}

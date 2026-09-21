import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useBlockedUsers } from '@/features/trust-safety/hooks/useBlockedUsers';
import { PlayerDiscoveryRepository } from '@/features/scout-discovery/repositories/PlayerDiscoveryRepository';
import {
  type DiscoverablePlayer,
  type DiscoveryFilters,
  type DiscoverySearchScope,
  type DiscoverySortOption,
} from '@/features/scout-discovery/types';

export type UsePlayerDiscoveryOptions = {
  search: string;
  searchScope?: DiscoverySearchScope;
  filters: DiscoveryFilters;
  sort: DiscoverySortOption;
  enabled?: boolean;
};

export function usePlayerDiscovery({
  search,
  searchScope = 'all',
  filters,
  sort,
  enabled = true,
}: UsePlayerDiscoveryOptions) {
  const { user } = useAuth();
  const { blockedIds } = useBlockedUsers(user?.id ?? null);

  const debouncedSearch = useDebounce(search, 300);

  const discoveryQuery = useMemo(
    () => ({ search: debouncedSearch, searchScope, filters, sort }),
    [debouncedSearch, searchScope, filters, sort],
  );

  const query = useInfiniteQuery({
    queryKey: ['scout-discovery', discoveryQuery],
    initialPageParam: null as string | null,
    enabled,
    queryFn: ({ pageParam }) =>
      PlayerDiscoveryRepository.getInstance().fetchPlayersPage(discoveryQuery, pageParam),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined,
    staleTime: 30_000,
  });

  const players = useMemo(
    () =>
      query.data?.pages
        .flatMap((page) => page.players)
        .filter((player) => !blockedIds.has(player.id)) ?? [],
    [blockedIds, query.data],
  );

  const loadMore = useCallback(() => {
    if (!query.hasNextPage || query.isFetchingNextPage) {
      return;
    }
    void query.fetchNextPage();
  }, [query]);

  const refresh = useCallback(() => void query.refetch(), [query]);

  return {
    players,
    isLoading: query.isLoading,
    isLoadingMore: query.isFetchingNextPage,
    error: query.error instanceof Error ? query.error.message : null,
    hasMore: query.hasNextPage ?? false,
    loadMore,
    refresh,
  };
}

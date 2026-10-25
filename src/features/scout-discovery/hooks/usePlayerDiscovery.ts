import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '@/data/queryKeys';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useBlockedUsers } from '@/features/trust-safety/hooks/useBlockedUsers';
import { visibleForViewer } from '@/features/trust-safety/services/blockedUserState';
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
  const { blockedIds, isReady: blocksReady, error: blocksError, refresh: refreshBlocks } = useBlockedUsers(user?.id ?? null);

  const debouncedSearch = useDebounce(search, 300);

  const discoveryQuery = useMemo(
    () => ({ search: debouncedSearch, searchScope, filters, sort }),
    [debouncedSearch, searchScope, filters, sort],
  );

  const query = useInfiniteQuery({
    queryKey: queryKeys.scoutDiscovery.page(discoveryQuery),
    initialPageParam: null as string | null,
    enabled,
    queryFn: ({ pageParam }) =>
      PlayerDiscoveryRepository.getInstance().fetchPlayersPage(discoveryQuery, pageParam),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined,
    staleTime: 30_000,
  });

  const players = useMemo(
    () => visibleForViewer(query.data?.pages.flatMap((page) => page.players) ?? [], blockedIds, blocksReady),
    [blockedIds, blocksReady, query.data],
  );

  const loadMore = useCallback(() => {
    if (!query.hasNextPage || query.isFetchingNextPage) {
      return;
    }
    void query.fetchNextPage();
  }, [query]);

  const refresh = useCallback(() => { void query.refetch(); void refreshBlocks(); }, [query, refreshBlocks]);

  return {
    players,
    isSearchPending: search !== debouncedSearch,
    isRefreshing: query.isRefetching && !query.isFetchingNextPage,
    isLoading: query.isLoading || (!blocksReady && !blocksError),
    isLoadingMore: query.isFetchingNextPage,
    error: blocksError instanceof Error ? blocksError.message : query.error instanceof Error ? query.error.message : null,
    hasMore: query.hasNextPage ?? false,
    loadMore,
    refresh,
  };
}

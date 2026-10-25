import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BlockedUserRepository } from '@/features/trust-safety/repositories/BlockedUserRepository';
import { type BlockedUser } from '@/features/trust-safety/types';
import { mergeBlockedUser } from '@/features/trust-safety/services/blockedUserState';

/** Viewer-scoped shared state: a successful block updates every mounted consumer. */
export function useBlockedUsers(blockerId: string | null) {
  const repository = BlockedUserRepository.getInstance();
  const client = useQueryClient();
  const key = useMemo(() => ['blockedUsers', blockerId] as const, [blockerId]);
  const query = useQuery({ queryKey: key, enabled: Boolean(blockerId),
    queryFn: () => blockerId ? repository.fetchBlockedUsers(blockerId) : Promise.resolve([]), staleTime: 30_000 });
  const blockedUsers = useMemo(() => blockerId ? query.data ?? [] : [], [blockerId, query.data]);
  const blockedIds = useMemo(() => new Set(blockedUsers.map((entry) => entry.blockedUserId)), [blockedUsers]);
  const blockUser = useCallback(async (blockedUserId: string, blockedUserName: string) => {
    if (!blockerId) return;
    await client.cancelQueries({ queryKey: key });
    const entry = await repository.blockUser(blockerId, blockedUserId, blockedUserName);
    client.setQueryData<BlockedUser[]>(key, (current) => mergeBlockedUser(current, entry));
    await client.invalidateQueries({ queryKey: key });
  }, [blockerId, client, key, repository]);
  const unblockUser = useCallback(async (blockedUserId: string) => {
    if (!blockerId) return;
    await client.cancelQueries({ queryKey: key });
    await repository.unblockUser(blockerId, blockedUserId);
    client.setQueryData<BlockedUser[]>(key, (current) => current?.filter((v) => v.blockedUserId !== blockedUserId));
    await client.invalidateQueries({ queryKey: key });
  }, [blockerId, client, key, repository]);
  return { blockedUsers, blockedIds, isLoading: Boolean(blockerId) && query.isPending,
    isReady: !blockerId || query.isSuccess, error: query.error,
    blockUser, unblockUser, isUserBlocked: (id: string) => blockedIds.has(id), refresh: query.refetch };
}

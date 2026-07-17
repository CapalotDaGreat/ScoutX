import { useCallback, useEffect, useMemo, useState } from 'react';
import { BlockedUserRepository } from '@/features/trust-safety/repositories/BlockedUserRepository';
import { type BlockedUser } from '@/features/trust-safety/types';

export function useBlockedUsers(blockerId: string | null) {
  const repository = BlockedUserRepository.getInstance();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!blockerId) {
      setBlockedUsers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const next = await repository.fetchBlockedUsers(blockerId);
      setBlockedUsers(next);
    } finally {
      setIsLoading(false);
    }
  }, [blockerId, repository]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const blockedIds = useMemo(
    () => new Set(blockedUsers.map((entry) => entry.blockedUserId)),
    [blockedUsers],
  );

  const blockUser = useCallback(
    async (blockedUserId: string, blockedUserName: string) => {
      if (!blockerId) {
        return;
      }
      const entry = await repository.blockUser(blockerId, blockedUserId, blockedUserName);
      setBlockedUsers((current) => [
        ...current.filter((item) => item.blockedUserId !== blockedUserId),
        entry,
      ]);
    },
    [blockerId, repository],
  );

  const unblockUser = useCallback(
    async (blockedUserId: string) => {
      if (!blockerId) {
        return;
      }
      await repository.unblockUser(blockerId, blockedUserId);
      setBlockedUsers((current) => current.filter((item) => item.blockedUserId !== blockedUserId));
    },
    [blockerId, repository],
  );

  const isUserBlocked = useCallback(
    (userId: string) => blockedIds.has(userId),
    [blockedIds],
  );

  return {
    blockedUsers,
    blockedIds,
    isLoading,
    blockUser,
    unblockUser,
    isUserBlocked,
    refresh,
  };
}

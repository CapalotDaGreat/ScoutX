import { loadScopedValue, saveScopedValue } from '@/data/scopedAsyncStorage';
import { type BlockedUser } from '@/features/trust-safety/types';

const BLOCKED_STORAGE_KEY = '@scoutx/trust-safety/blocked';

export async function loadLocalBlockedUsers(blockerId: string): Promise<BlockedUser[]> {
  return loadScopedValue(
    BLOCKED_STORAGE_KEY,
    blockerId,
    (value) => (Array.isArray(value) ? (value as BlockedUser[]) : null),
    () => [],
  );
}

export async function saveLocalBlockedUser(blockerId: string, entry: BlockedUser): Promise<void> {
  const existing = await loadLocalBlockedUsers(blockerId);
  const next = existing.filter((item) => item.blockedUserId !== entry.blockedUserId);
  next.push(entry);
  await saveScopedValue(BLOCKED_STORAGE_KEY, blockerId, next);
}

export async function removeLocalBlockedUser(
  blockerId: string,
  blockedUserId: string,
): Promise<void> {
  const existing = await loadLocalBlockedUsers(blockerId);
  await saveScopedValue(
    BLOCKED_STORAGE_KEY,
    blockerId,
    existing.filter((item) => item.blockedUserId !== blockedUserId),
  );
}

import type { BlockedUser } from '../types';

export function visibleForViewer<T extends { id: string }>(records: readonly T[], blockedIds: ReadonlySet<string>, ready: boolean): T[] {
  return ready ? records.filter((record) => !blockedIds.has(record.id)) : [];
}

export function mergeBlockedUser(current: BlockedUser[] | undefined, entry: BlockedUser): BlockedUser[] | undefined {
  // A single mutation is not a complete list; keep initial reads unready.
  return current ? [...current.filter((v) => v.blockedUserId !== entry.blockedUserId), entry] : undefined;
}

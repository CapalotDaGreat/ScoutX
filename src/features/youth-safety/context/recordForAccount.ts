import type { UserSafetyRecord } from '@/features/youth-safety/repositories/UserSafetyRepository';

/** A safety record together with the account it was read for. */
export type LoadedSafetyRecord = { uid: string; record: UserSafetyRecord | null };

/**
 * The record the age/guardian gate may use for `uid`: null when no account is gated, undefined while
 * that account's record has not arrived. A record read for a different account is never reused, so
 * after switching accounts the new account stays gated until its own record loads instead of
 * passing for one render on the previous account's age band.
 */
export function recordForAccount(uid: string | null, loaded: LoadedSafetyRecord | null): UserSafetyRecord | null | undefined {
  if (!uid) return null;
  return loaded && loaded.uid === uid ? loaded.record : undefined;
}

import type { UserSafetyRecord } from '@/features/youth-safety/repositories/UserSafetyRepository';

/** A safety record together with the account it was read for. */
export type LoadedSafetyRecord = { uid: string; record: UserSafetyRecord | null; unavailable?: boolean };

/** A subscription error never proves that a safety record is missing. */
export function failedSafetyRead(uid: string, loaded: LoadedSafetyRecord | null): LoadedSafetyRecord {
  if (loaded?.uid === uid && loaded.unavailable !== true) return loaded;
  return { uid, record: null, unavailable: true };
}

/**
 * The record the age/guardian gate may use for `uid`: null when no account is gated, undefined while
 * that account's record has not arrived. A record read for a different account is never reused, so
 * after switching accounts the new account stays gated until its own record loads instead of
 * passing for one render on the previous account's age band. A failed read is not a missing age band.
 */
export function recordForAccount(uid: string | null, loaded: LoadedSafetyRecord | null): UserSafetyRecord | null | undefined {
  if (!uid) return null;
  if (!loaded || loaded.uid !== uid || loaded.unavailable) return undefined;
  return loaded.record;
}

/** True when this account's safety record could not be read. Distinct from "no age band yet". */
export function safetyLoadFailed(uid: string | null, loaded: LoadedSafetyRecord | null): boolean {
  return Boolean(uid && loaded && loaded.uid === uid && loaded.unavailable);
}

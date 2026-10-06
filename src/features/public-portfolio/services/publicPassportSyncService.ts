import { createCallableFunction } from '@/firebase/callableFunctions';

const refreshedOwners = new Set<string>();

/**
 * Asks the server to (re)project `publicPassports/{uid}` from the private profile.
 *
 * The Firestore trigger keeps the projection in sync for every future profile write; this
 * one-shot call backfills players whose profile predates the projection. It is best-effort
 * and silent: if Functions are unavailable the next profile save triggers the projection.
 */
export async function ensurePublicPassportProjected(playerId: string): Promise<void> {
  if (refreshedOwners.has(playerId)) {
    return;
  }
  refreshedOwners.add(playerId);

  const callable = createCallableFunction<Record<string, never>>('refreshPublicPassport');
  if (!callable) {
    return;
  }
  try {
    await callable({});
  } catch {
    // Allow a retry later in the session.
    refreshedOwners.delete(playerId);
  }
}

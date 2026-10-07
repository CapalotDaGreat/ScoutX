import { getFirebaseAuth } from '@/config/firebase';
import { createCallableFunction } from '@/firebase/callableFunctions';

export type SelfServiceRole = 'player' | 'scout' | 'coach';

type ConfirmRoleResponse = {
  role?: unknown;
  claimUpdated?: unknown;
};

/**
 * Asks the server to confirm the chosen role and mirror it into the ID token as a custom
 * claim, then forces a token refresh so Firestore/Storage rules see the new claim at once.
 *
 * Returns `false` when Cloud Functions are not configured (dev / mock projects) so the
 * caller can fall back to the informational users-document write.
 */
export async function confirmRoleWithServer(role: SelfServiceRole): Promise<boolean> {
  const callable = createCallableFunction<{ role: SelfServiceRole }>('confirmRole');
  if (!callable) {
    return false;
  }

  const result = await callable({ role });
  const data = result.data as ConfirmRoleResponse | undefined;
  if (data?.role !== role) {
    throw new Error('Role confirmation returned an unexpected result.');
  }

  await getFirebaseAuth()?.currentUser?.getIdToken(true);
  return true;
}

/**
 * Reads the role from the current ID token. Returns null when there is no signed-in user,
 * the token has no role claim yet, or Firebase is not configured.
 */
export async function readRoleClaim(): Promise<string | null> {
  const user = getFirebaseAuth()?.currentUser;
  if (!user) {
    return null;
  }
  const tokenResult = await user.getIdTokenResult();
  const role = tokenResult.claims.role;
  return typeof role === 'string' ? role : null;
}

export type StaffRole = 'moderator' | 'admin';

/** Display hint only; every staff callable re-checks the claim server-side. */
export async function readStaffRoleClaim(): Promise<StaffRole | null> {
  const user = getFirebaseAuth()?.currentUser;
  if (!user) {
    return null;
  }
  const tokenResult = await user.getIdTokenResult();
  const role = tokenResult.claims.staffRole;
  return role === 'moderator' || role === 'admin' ? role : null;
}

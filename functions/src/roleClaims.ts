import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { createCallableOptions } from './callableOptions';

/**
 * Roles a user may claim for themselves. `club` and `admin` are never self-assignable;
 * they are granted by an operator through the Admin SDK.
 */
export type SelfServiceRole = 'player' | 'scout' | 'coach';

const SELF_SERVICE_ROLES: readonly SelfServiceRole[] = ['player', 'scout', 'coach'];

/** Roles that require a real (non-anonymous) sign-in before they can be claimed. */
const NON_ANONYMOUS_ROLES: readonly SelfServiceRole[] = ['scout', 'coach'];

type UserDoc = {
  role?: string;
  roleConfirmed?: boolean;
};

function isSelfServiceRole(value: unknown): value is SelfServiceRole {
  return typeof value === 'string' && (SELF_SERVICE_ROLES as readonly string[]).includes(value);
}

/**
 * Confirms the caller's role and mirrors it into a custom auth claim so Firestore and
 * Storage rules can trust `request.auth.token.role` instead of a client-written document.
 *
 * - The role is chosen once. A second call with a different role is rejected once the
 *   users document is marked `roleConfirmed`.
 * - Scout and coach roles require a non-anonymous sign-in.
 * - `club` / `admin` are never self-assignable.
 */
export const confirmRole = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required to confirm a role.');
  }

  const requested = (request.data as { role?: unknown } | undefined)?.role;
  if (!isSelfServiceRole(requested)) {
    throw new HttpsError('invalid-argument', 'Role must be one of player, scout or coach.');
  }

  const signInProvider = request.auth?.token.firebase?.sign_in_provider;
  if (NON_ANONYMOUS_ROLES.includes(requested) && signInProvider === 'anonymous') {
    throw new HttpsError(
      'failed-precondition',
      'Create an account before choosing the scout or coach role.',
    );
  }

  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);
  const now = new Date().toISOString();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const existing = (snapshot.data() ?? {}) as UserDoc;
    if (existing.roleConfirmed === true && existing.role && existing.role !== requested) {
      throw new HttpsError(
        'failed-precondition',
        'Your role has already been confirmed and cannot be changed from the app.',
      );
    }
    transaction.set(
      userRef,
      {
        uid,
        role: requested,
        roleConfirmed: true,
        isAnonymous: signInProvider === 'anonymous',
        roleClaimSyncedAt: now,
        updatedAt: now,
        ...(snapshot.exists ? {} : { createdAt: now }),
      },
      { merge: true },
    );
  });

  const auth = getAuth();
  const userRecord = await auth.getUser(uid);
  const currentClaims = userRecord.customClaims ?? {};
  if (currentClaims.role !== requested) {
    await auth.setCustomUserClaims(uid, { ...currentClaims, role: requested });
  }

  logger.info('Role confirmed', { uid, role: requested });
  return { role: requested, claimUpdated: currentClaims.role !== requested };
});

import { getFirebaseAuth } from '@/config/firebase';
import { deleteAuthenticatedAccountViaCloud } from '@/features/auth/services/appleTokenPersistenceService';
import { AuthError } from '@/features/auth/types';
import { signOutFromFirebase } from '@/features/auth/services/authService';
import { classifyDeletionError, type AccountDeletionFailure } from '@/features/auth/services/reauthModel';

/** Raised by `deleteCurrentAccount`; `kind` decides whether the UI asks for a fresh sign-in. */
export class AccountDeletionError extends Error {
  readonly kind: AccountDeletionFailure;

  constructor(kind: AccountDeletionFailure) {
    super(kind === 'recent_login_required' ? 'Recent sign-in required.' : 'Account deletion failed.');
    this.kind = kind;
    this.name = 'AccountDeletionError';
  }
}

/**
 * Deletes the current account on the server: hide, revoke Apple tokens and sessions, delete
 * Firestore and Storage data, verify, then remove the sign-in. There is deliberately no local
 * fallback: server-only records (guardian contacts, consent proof, mail, quarantine) are
 * unreachable from the client, so deleting the sign-in locally would orphan them. The device is
 * only signed out after the server confirms deletion.
 */
export async function deleteCurrentAccount(userId: string): Promise<void> {
  const auth = getFirebaseAuth();

  if (!auth?.currentUser || auth.currentUser.uid !== userId) {
    throw new AuthError('You must be signed in to delete your account.', 'invalid-credentials');
  }

  let deleted = false;
  try {
    deleted = await deleteAuthenticatedAccountViaCloud();
  } catch (error) {
    throw new AccountDeletionError(classifyDeletionError(error));
  }
  if (!deleted) throw new AccountDeletionError('failed');

  try {
    await signOutFromFirebase();
  } catch {
    // The Auth user is already gone on the server; the local session ends with it.
  }
}

import { deleteUser } from 'firebase/auth';
import { deleteDoc, doc } from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb } from '@/config/firebase';
import { mapAccountDeletionError } from '@/features/auth/services/authErrorMapping';
import { deleteAuthenticatedAccountViaCloud } from '@/features/auth/services/appleTokenPersistenceService';
import { AuthError } from '@/features/auth/types';
import { signOutFromFirebase } from '@/features/auth/services/authService';

async function deleteOwnedDocumentsLocally(userId: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    return;
  }

  await Promise.all([
    deleteDoc(doc(db, 'users', userId)).catch(() => undefined),
    deleteDoc(doc(db, 'profiles', userId)).catch(() => undefined),
    deleteDoc(doc(db, 'pushTokens', userId)).catch(() => undefined),
    deleteDoc(doc(db, 'discoverablePlayers', userId)).catch(() => undefined),
  ]);
}

/**
 * Deletes the current account.
 * Prefer Cloud Function path so Apple tokens are revoked (App Store Guideline 5.1.1(v)).
 */
export async function deleteCurrentAccount(userId: string): Promise<void> {
  const auth = getFirebaseAuth();

  if (!auth?.currentUser || auth.currentUser.uid !== userId) {
    throw new AuthError('You must be signed in to delete your account.', 'invalid-credentials');
  }

  const deletedViaCloud = await deleteAuthenticatedAccountViaCloud();
  if (deletedViaCloud) {
    try {
      await signOutFromFirebase();
    } catch {
      // Auth user may already be deleted by the Cloud Function.
    }
    return;
  }

  await deleteOwnedDocumentsLocally(userId);

  try {
    await deleteUser(auth.currentUser);
  } catch (error) {
    throw mapAccountDeletionError(error);
  }

  await signOutFromFirebase();
}

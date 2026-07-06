import { deleteUser } from 'firebase/auth';
import { deleteDoc, doc } from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb } from '@/config/firebase';
import { AuthError } from '@/features/auth/types';
import { signOutFromFirebase } from '@/features/auth/services/authService';

export async function deleteCurrentAccount(userId: string): Promise<void> {
  const auth = getFirebaseAuth();
  const db = getFirestoreDb();

  if (!auth?.currentUser || auth.currentUser.uid !== userId) {
    throw new AuthError('You must be signed in to delete your account.', 'invalid-credentials');
  }

  if (db) {
    await Promise.all([
      deleteDoc(doc(db, 'users', userId)).catch(() => undefined),
      deleteDoc(doc(db, 'profiles', userId)).catch(() => undefined),
      deleteDoc(doc(db, 'pushTokens', userId)).catch(() => undefined),
      deleteDoc(doc(db, 'discoverablePlayers', userId)).catch(() => undefined),
    ]);
  }

  try {
    await deleteUser(auth.currentUser);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to delete account. You may need to sign in again before deleting.';
    throw new AuthError(message, 'invalid-credentials');
  }

  await signOutFromFirebase();
}

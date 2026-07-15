import { doc, getDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { getFirestoreDb } from '@/config/firebase';
import { createAuthUser, type AuthUser } from '@/features/auth/types';
import { fetchUserDocument } from '@/features/auth/services/userService';
import { UserModel } from '@/features/player-profile/models/UserModel';

export async function resolveAuthUserFromFirebaseUser(user: User): Promise<AuthUser> {
  const db = getFirestoreDb();
  if (!db) {
    return createAuthUser({
      uid: user.uid,
      isAnonymous: user.isAnonymous,
      displayName: user.displayName ?? 'ScoutX User',
      email: user.email ?? undefined,
      role: user.isAnonymous ? 'guest' : undefined,
    });
  }

  const userDoc = await fetchUserDocument(user.uid);
  if (userDoc) {
    return createAuthUser({
      uid: userDoc.uid,
      isAnonymous: userDoc.isAnonymous,
      displayName: userDoc.name,
      email: userDoc.email || undefined,
      role: userDoc.role,
    });
  }

  const legacySnap = await getDoc(doc(db, 'users', user.uid));
  if (legacySnap.exists()) {
    return UserModel.fromFirestore(user.uid, legacySnap.data()).toAuthUser();
  }

  return createAuthUser({
    uid: user.uid,
    isAnonymous: user.isAnonymous,
    displayName: user.displayName ?? 'ScoutX User',
    email: user.email ?? undefined,
    role: user.isAnonymous ? 'guest' : undefined,
  });
}

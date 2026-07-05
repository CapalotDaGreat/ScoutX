import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb, isFirebaseReady } from '@/config/firebase';
import { parseUserDocument } from '@/features/auth/models/UserDocumentModel';
import {
  AuthError,
  createAuthUser,
  type AuthUser,
  type ForgotPasswordPayload,
  type SignInPayload,
  type SignUpPayload,
} from '@/features/auth/types';
import {
  createGuestUserDocument,
  ensureUserDocument,
  fetchUserDocument,
  migrateAnonymousUserData,
  upgradeUserDocument,
} from '@/features/auth/services/userService';
import {
  mockForgotPassword,
  mockInitializeSession,
  mockSignIn,
  mockSignInAsGuest,
  mockSignOut,
  mockSignUp,
  subscribeToMockAuthSession,
} from '@/features/auth/services/mockAuthService';
import { UserModel } from '@/features/player-profile/models/UserModel';
import { ProfileModel } from '@/features/player-profile/models/ProfileModel';

function mapFirebaseUser(user: User, role?: AuthUser['role']): AuthUser {
  const displayName =
    user.displayName ?? user.email?.split('@')[0] ?? (user.isAnonymous ? 'Guest' : 'ScoutX User');

  return createAuthUser({
    uid: user.uid,
    isAnonymous: user.isAnonymous,
    displayName,
    email: user.email ?? undefined,
    role: user.isAnonymous ? 'guest' : role,
  });
}

async function resolveAuthUserFromFirestore(user: User): Promise<AuthUser> {
  const db = getFirestoreDb();
  if (!db) {
    return mapFirebaseUser(user);
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

  if (user.isAnonymous) {
    const guestDoc = await createGuestUserDocument(user.uid);
    return createAuthUser({
      uid: guestDoc.uid,
      isAnonymous: true,
      displayName: guestDoc.name,
      role: 'guest',
    });
  }

  const legacySnap = await getDoc(doc(db, 'users', user.uid));
  if (legacySnap.exists()) {
    const userModel = UserModel.fromFirestore(user.uid, legacySnap.data());
    return userModel.toAuthUser();
  }

  return mapFirebaseUser(user);
}

function mapFirebaseError(error: unknown): AuthError {
  if (error instanceof AuthError) {
    return error;
  }

  const message = error instanceof Error ? error.message : 'Authentication failed.';
  const code = error instanceof Error && 'code' in error ? String(error.code) : '';

  if (message.includes('invalid-email') || code.includes('invalid-email')) {
    return new AuthError('Please enter a valid email address.', 'invalid-email');
  }

  if (
    message.includes('wrong-password') ||
    message.includes('invalid-credential') ||
    code.includes('invalid-credential')
  ) {
    return new AuthError('The email or password is incorrect.', 'invalid-credentials');
  }

  if (message.includes('email-already-in-use') || code.includes('email-already-in-use')) {
    return new AuthError('This email is already registered.', 'email-in-use');
  }

  if (message.includes('credential-already-in-use') || code.includes('credential-already-in-use')) {
    return new AuthError('This email is already linked to another account.', 'credential-already-in-use');
  }

  if (message.includes('weak-password') || code.includes('weak-password')) {
    return new AuthError('Password must be at least 8 characters long.', 'weak-password');
  }

  if (message.includes('user-not-found') || code.includes('user-not-found')) {
    return new AuthError('We could not find an account for this email.', 'not-found');
  }

  if (message.includes('admin-restricted-operation') || code.includes('admin-restricted-operation')) {
    return new AuthError(
      'Anonymous sign-in is disabled for this Firebase project. Enable it in the Firebase console.',
      'anonymous-disabled',
    );
  }

  return new AuthError(message, 'invalid-credentials');
}

function getCurrentFirebaseUser(): User | null {
  return getFirebaseAuth()?.currentUser ?? null;
}

export function initializeAuthListener(callback: (user: AuthUser | null) => void): () => void {
  if (!isFirebaseReady()) {
    void mockInitializeSession().then((guest) => {
      callback(guest);
    });

    return subscribeToMockAuthSession(callback);
  }

  const auth = getFirebaseAuth();
  const db = getFirestoreDb();
  if (!auth || !db) {
    callback(null);
    return () => undefined;
  }

  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null);
      return;
    }

    try {
      callback(await resolveAuthUserFromFirestore(user));
    } catch (error) {
      console.error('Error resolving auth user:', error);
      callback(mapFirebaseUser(user));
    }
  });
}

export async function signInAnonymouslyWithFirebase(): Promise<AuthUser> {
  if (!isFirebaseReady()) {
    return mockSignInAsGuest();
  }

  const auth = getFirebaseAuth();
  if (!auth) {
    throw new AuthError('Firebase authentication is not configured.', 'invalid-credentials');
  }

  try {
    const currentUser = auth.currentUser;
    if (currentUser?.isAnonymous) {
      return resolveAuthUserFromFirestore(currentUser);
    }

    const credential = await signInAnonymously(auth);
    const guestDoc = await createGuestUserDocument(credential.user.uid);
    return createAuthUser({
      uid: guestDoc.uid,
      isAnonymous: true,
      displayName: guestDoc.name,
      role: 'guest',
    });
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

export async function signInWithFirebase(payload: SignInPayload): Promise<AuthUser> {
  if (!isFirebaseReady()) {
    return mockSignIn(payload);
  }

  const auth = getFirebaseAuth();
  if (!auth) {
    throw new AuthError('Firebase authentication is not configured.', 'invalid-credentials');
  }

  try {
    const anonymousUser = auth.currentUser;
    const credential = EmailAuthProvider.credential(payload.email, payload.password);

    if (anonymousUser?.isAnonymous) {
      try {
        const linked = await linkWithCredential(anonymousUser, credential);
        const userDoc = await upgradeUserDocument(linked.user.uid, {
          name: linked.user.displayName ?? payload.email.split('@')[0],
          email: payload.email,
        });
        return createAuthUser({
          uid: userDoc.uid,
          isAnonymous: false,
          displayName: userDoc.name,
          email: userDoc.email,
          role: userDoc.role === 'guest' ? undefined : userDoc.role,
        });
      } catch (linkError) {
        if (
          linkError instanceof Error &&
          ('code' in linkError &&
            (String(linkError.code).includes('credential-already-in-use') ||
              String(linkError.code).includes('email-already-in-use')))
        ) {
          const anonymousUid = anonymousUser.uid;
          const signedIn = await signInWithEmailAndPassword(auth, payload.email, payload.password);
          await migrateAnonymousUserData(anonymousUid, signedIn.user.uid);
          return resolveAuthUserFromFirestore(signedIn.user);
        }
        throw linkError;
      }
    }

    const signedIn = await signInWithEmailAndPassword(auth, payload.email, payload.password);
    return resolveAuthUserFromFirestore(signedIn.user);
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

export async function signUpWithFirebase(payload: SignUpPayload): Promise<AuthUser> {
  if (!isFirebaseReady()) {
    return mockSignUp(payload);
  }

  const auth = getFirebaseAuth();
  const db = getFirestoreDb();
  if (!auth || !db) {
    throw new AuthError('Firebase authentication is not configured.', 'invalid-credentials');
  }

  try {
    const anonymousUser = auth.currentUser;
    const credential = EmailAuthProvider.credential(payload.email, payload.password);
    const displayName = payload.fullName.trim() || payload.email.split('@')[0];

    if (anonymousUser?.isAnonymous) {
      const linked = await linkWithCredential(anonymousUser, credential);
      await updateProfile(linked.user, { displayName });

      const userDoc = await upgradeUserDocument(linked.user.uid, {
        name: displayName,
        email: payload.email,
      });

      const profileRef = doc(db, 'profiles', linked.user.uid);
      const profileSnap = await getDoc(profileRef);
      if (!profileSnap.exists()) {
        const defaultProfile = ProfileModel.getDefaultProfile(linked.user.uid, payload.email);
        defaultProfile.fullName = displayName;
        await setDoc(profileRef, ProfileModel.toFirestore(defaultProfile));
      } else {
        await setDoc(
          profileRef,
          {
            fullName: displayName,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
      }

      return createAuthUser({
        uid: userDoc.uid,
        isAnonymous: false,
        displayName: userDoc.name,
        email: userDoc.email,
        role: undefined,
      });
    }

    const created = await createUserWithEmailAndPassword(auth, payload.email, payload.password);
    await updateProfile(created.user, { displayName });

    const userDoc = await ensureUserDocument({
      uid: created.user.uid,
      name: displayName,
      email: payload.email,
      isAnonymous: false,
    });

    const defaultProfile = ProfileModel.getDefaultProfile(created.user.uid, payload.email);
    defaultProfile.fullName = displayName;
    await setDoc(doc(db, 'profiles', created.user.uid), ProfileModel.toFirestore(defaultProfile));

    return createAuthUser({
      uid: userDoc.uid,
      isAnonymous: false,
      displayName: userDoc.name,
      email: userDoc.email,
      role: undefined,
    });
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

export async function resetPasswordWithFirebase(payload: ForgotPasswordPayload): Promise<void> {
  if (!isFirebaseReady()) {
    await mockForgotPassword(payload);
    return;
  }

  const auth = getFirebaseAuth();
  if (!auth) {
    throw new AuthError('Firebase authentication is not configured.', 'invalid-credentials');
  }

  try {
    await sendPasswordResetEmail(auth, payload.email);
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

export async function signOutFromFirebase(): Promise<void> {
  if (!isFirebaseReady()) {
    await mockSignOut();
    return;
  }

  const auth = getFirebaseAuth();
  if (!auth) {
    return;
  }

  await firebaseSignOut(auth);
}

export function getCurrentAuthUserSnapshot(): AuthUser | null {
  const firebaseUser = getCurrentFirebaseUser();
  if (!firebaseUser) {
    return null;
  }

  return mapFirebaseUser(firebaseUser);
}

export function isCurrentUserAnonymous(): boolean {
  return getCurrentFirebaseUser()?.isAnonymous ?? false;
}

export async function mapFirestoreUserDocument(uid: string): Promise<AuthUser | null> {
  const document = await fetchUserDocument(uid);
  if (!document) {
    return null;
  }

  return createAuthUser({
    uid: document.uid,
    isAnonymous: document.isAnonymous,
    displayName: document.name,
    email: document.email || undefined,
    role: document.role,
  });
}

// Re-export for tests and tooling
export { parseUserDocument };

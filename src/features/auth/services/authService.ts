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
import { getFirebaseAuth, getFirestoreDb } from '@/config/firebase';
import { getFirebaseActionCodeSettings } from '@/config/deepLinking';
import {
  assertProductionAuthConfigured,
  PASSWORD_RESET_SUCCESS_MESSAGE,
  shouldUseMockAuth,
} from '@/config/authSecurity';
import { sendVerificationEmailForUser } from '@/features/auth/services/authActionLinkService';
import { parseUserDocument } from '@/features/auth/models/UserDocumentModel';
import {
  mapFirebaseAuthError,
  mapFirebasePasswordResetError,
} from '@/features/auth/services/authErrorMapping';
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

const ROLE_CLAIM_TIMEOUT_MS = 1_500;
const ROLE_DOC_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function parseRoleClaim(value: unknown): AuthUser['role'] {
  return value === 'player' || value === 'scout' || value === 'coach' || value === 'club'
    ? value
    : undefined;
}

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

function getCurrentFirebaseUser(): User | null {
  return getFirebaseAuth()?.currentUser ?? null;
}

export function initializeAuthListener(callback: (user: AuthUser | null) => void): () => void {
  assertProductionAuthConfigured();

  if (shouldUseMockAuth()) {
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

  let latestUid: string | null = null;

  return onAuthStateChanged(auth, (user) => {
    latestUid = user?.uid ?? null;
    if (!user) {
      callback(null);
      return;
    }

    const emitIfCurrent = (next: AuthUser) => {
      if (latestUid === user.uid) {
        callback(next);
      }
    };

    if (user.isAnonymous) {
      emitIfCurrent(mapFirebaseUser(user));
    }

    // A signed-in user emitted without a role reads as "needs role selection" and resets
    // navigation, so resolve the role from the cached token claim before the first emit.
    void withTimeout(user.getIdTokenResult(), ROLE_CLAIM_TIMEOUT_MS)
      .then((token) => parseRoleClaim(token?.claims.role))
      .catch(() => undefined)
      .then(async (claimRole) => {
        if (!user.isAnonymous && claimRole) {
          emitIfCurrent(mapFirebaseUser(user, claimRole));
        }
        try {
          const pending = resolveAuthUserFromFirestore(user);
          const resolved = await withTimeout(pending, ROLE_DOC_TIMEOUT_MS);
          if (resolved) {
            emitIfCurrent(resolved);
          } else {
            emitIfCurrent(mapFirebaseUser(user, claimRole));
            void pending.then(emitIfCurrent).catch(() => undefined);
          }
        } catch (error) {
          if (!user.isAnonymous && !claimRole) {
            emitIfCurrent(mapFirebaseUser(user));
          }
          if (__DEV__) {
            console.error('Error resolving auth user.');
            if (error instanceof Error) {
              console.error(error.message);
            }
          }
        }
      });
  });
}

export async function signInAnonymouslyWithFirebase(): Promise<AuthUser> {
  assertProductionAuthConfigured();

  if (shouldUseMockAuth()) {
    return mockSignInAsGuest();
  }

  const auth = getFirebaseAuth();
  if (!auth) {
    throw new AuthError('Firebase authentication is not configured.', 'invalid-credentials');
  }

  const runAnonymousSignIn = async (): Promise<AuthUser> => {
    const currentUser = auth.currentUser;
    if (currentUser?.isAnonymous) {
      return resolveAuthUserFromFirestore(currentUser).catch(() => mapFirebaseUser(currentUser));
    }

    const credential = await signInAnonymously(auth);

    try {
      const guestDoc = await Promise.race([
        createGuestUserDocument(credential.user.uid),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Guest profile write timed out.')), 5_000);
        }),
      ]);
      return createAuthUser({
        uid: guestDoc.uid,
        isAnonymous: true,
        displayName: guestDoc.name,
        role: 'guest',
      });
    } catch (documentError) {
      if (__DEV__) {
        console.warn('Guest profile write failed; continuing with anonymous session.', documentError);
      }
      return mapFirebaseUser(credential.user);
    }
  };

  try {
    return await Promise.race([
      runAnonymousSignIn(),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new AuthError('Anonymous sign-in timed out.', 'anonymous-disabled')),
          7_000,
        );
      }),
    ]);
  } catch (error) {
    throw mapFirebaseAuthError(error);
  }
}

export async function signInWithFirebase(payload: SignInPayload): Promise<AuthUser> {
  assertProductionAuthConfigured();

  if (shouldUseMockAuth()) {
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
    throw mapFirebaseAuthError(error);
  }
}

export async function signUpWithFirebase(payload: SignUpPayload): Promise<AuthUser> {
  assertProductionAuthConfigured();

  if (shouldUseMockAuth()) {
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

      await sendVerificationEmailForUser(linked.user);

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

    await sendVerificationEmailForUser(created.user);

    return createAuthUser({
      uid: userDoc.uid,
      isAnonymous: false,
      displayName: userDoc.name,
      email: userDoc.email,
      role: undefined,
    });
  } catch (error) {
    throw mapFirebaseAuthError(error);
  }
}

export async function resetPasswordWithFirebase(payload: ForgotPasswordPayload): Promise<void> {
  assertProductionAuthConfigured();

  if (shouldUseMockAuth()) {
    await mockForgotPassword(payload);
    return;
  }

  const auth = getFirebaseAuth();
  if (!auth) {
    throw new AuthError('Firebase authentication is not configured.', 'invalid-credentials');
  }

  try {
    await sendPasswordResetEmail(auth, payload.email, getFirebaseActionCodeSettings());
  } catch (error) {
    const mapped = mapFirebasePasswordResetError(error);
    if (mapped) {
      throw mapped;
    }
    // Intentionally succeed without revealing whether the email is registered.
  }
}

export function getPasswordResetSuccessMessage(): string {
  return PASSWORD_RESET_SUCCESS_MESSAGE;
}

export async function signOutFromFirebase(): Promise<void> {
  if (shouldUseMockAuth()) {
    await mockSignOut();
    return;
  }

  const auth = getFirebaseAuth();
  if (!auth) {
    return;
  }

  // Clear native Google session and allowlisted SecureStore secrets.
  // Firebase Auth session material is owned by Firebase persistence — never mirrored here.
  void import('@/features/auth/services/googleAuthService')
    .then(({ clearGoogleSignInSession }) => clearGoogleSignInSession())
    .catch(() => undefined);

  void import('@/services/secureStorage')
    .then(({ secureStorageService }) => secureStorageService.clearAllowlistedItems())
    .catch(() => undefined);

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

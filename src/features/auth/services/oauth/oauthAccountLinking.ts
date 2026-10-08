import {
  linkWithCredential,
  signInWithCredential,
  updateProfile,
  type AuthCredential,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb } from '@/config/firebase';
import { mapFirebaseAuthError } from '@/features/auth/services/authErrorMapping';
import { AuthError, type AuthUser } from '@/features/auth/types';
import {
  ensureUserDocument,
  fetchUserDocument,
  migrateAnonymousUserData,
  upgradeUserDocument,
} from '@/features/auth/services/userService';
import { ProfileModel } from '@/features/player-profile/models/ProfileModel';
import { resolveAuthUserFromFirebaseUser } from '@/features/auth/services/oauth/authUserResolver';
import type { OAuthLinkContext, SupportedOAuthProviderId } from '@/features/auth/services/oauth/types';

function getFirebaseAuthErrorCode(error: unknown): string {
  if (error instanceof Error && 'code' in error) {
    return String(error.code);
  }
  return '';
}

function isCredentialAlreadyInUse(error: unknown): boolean {
  const code = getFirebaseAuthErrorCode(error);
  return code.includes('credential-already-in-use') || code.includes('email-already-in-use');
}

function isAccountExistsWithDifferentCredential(error: unknown): boolean {
  return getFirebaseAuthErrorCode(error).includes('account-exists-with-different-credential');
}

function isProviderAlreadyLinked(user: User, providerId: SupportedOAuthProviderId): boolean {
  return user.providerData.some((provider) => provider.providerId === providerId);
}

async function provisionOAuthUserRecords(user: User, context: OAuthLinkContext): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    return;
  }

  const displayName = context.displayName?.trim() || user.displayName || 'PitchProof User';
  const email = context.email?.trim() || user.email || '';

  if (context.displayName && !user.displayName) {
    await updateProfile(user, { displayName });
  }

  const existingDoc = await fetchUserDocument(user.uid);
  if (!existingDoc) {
    await ensureUserDocument({
      uid: user.uid,
      name: displayName,
      email,
      isAnonymous: false,
    });
  } else if (!user.isAnonymous) {
    await upgradeUserDocument(user.uid, {
      name: displayName,
      email: email || existingDoc.email,
    });
  }

  const profileRef = doc(db, 'profiles', user.uid);
  const profileSnap = await getDoc(profileRef);
  if (!profileSnap.exists()) {
    const defaultProfile = ProfileModel.getDefaultProfile(user.uid, email);
    defaultProfile.fullName = displayName;
    await setDoc(profileRef, ProfileModel.toFirestore(defaultProfile));
  } else if (context.displayName) {
    await setDoc(
      profileRef,
      {
        fullName: displayName,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }
}

async function finalizeOAuthUser(user: User, context: OAuthLinkContext): Promise<AuthUser> {
  await provisionOAuthUserRecords(user, context);
  return resolveAuthUserFromFirebaseUser(user);
}

async function linkCredentialToUser(
  user: User,
  credential: AuthCredential,
  context: OAuthLinkContext,
): Promise<AuthUser> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new AuthError('Firebase authentication is not configured.', 'invalid-credentials');
  }

  try {
    const linked = await linkWithCredential(user, credential);
    return finalizeOAuthUser(linked.user, context);
  } catch (error) {
    if (isCredentialAlreadyInUse(error)) {
      const signedIn = await signInWithCredential(auth, credential);
      if (user.isAnonymous) {
        await migrateAnonymousUserData(user.uid, signedIn.user.uid);
      }
      return finalizeOAuthUser(signedIn.user, context);
    }

    if (isAccountExistsWithDifferentCredential(error)) {
      throw new AuthError(
        'An account with this email already exists. Sign in with your existing method first, then link your provider in Settings.',
        'account-exists-with-different-credential',
      );
    }

    throw mapFirebaseAuthError(error);
  }
}

export async function signInOrLinkOAuthCredential(
  credential: AuthCredential,
  providerId: SupportedOAuthProviderId,
  context: OAuthLinkContext = {},
): Promise<AuthUser> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new AuthError('Firebase authentication is not configured.', 'invalid-credentials');
  }

  const currentUser = auth.currentUser;

  if (currentUser?.isAnonymous) {
    return linkCredentialToUser(currentUser, credential, context);
  }

  if (currentUser && !currentUser.isAnonymous) {
    if (isProviderAlreadyLinked(currentUser, providerId)) {
      return finalizeOAuthUser(currentUser, context);
    }

    return linkCredentialToUser(currentUser, credential, context);
  }

  try {
    const signedIn = await signInWithCredential(auth, credential);
    return finalizeOAuthUser(signedIn.user, context);
  } catch (error) {
    // Cold sign-in cannot recover from credential/email conflicts by retrying
    // signInWithCredential — that would repeat the same failing call.
    // Linking recovery (sign in to the account that owns the credential) lives in
    // linkCredentialToUser when linkWithCredential throws credential-already-in-use.
    if (isAccountExistsWithDifferentCredential(error)) {
      throw new AuthError(
        'An account with this email already exists. Sign in with your existing method first, then link your provider in Settings.',
        'account-exists-with-different-credential',
      );
    }

    throw mapFirebaseAuthError(error);
  }
}

export function isOAuthProviderLinkedForCurrentUser(providerId: SupportedOAuthProviderId): boolean {
  const user = getFirebaseAuth()?.currentUser;
  if (!user) {
    return false;
  }

  return isProviderAlreadyLinked(user, providerId);
}

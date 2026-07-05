import { Platform } from 'react-native';
import {
  OAuthProvider,
  linkWithCredential,
  signInWithCredential,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb, isFirebaseReady } from '@/config/firebase';
import {
  AuthError,
  createAuthUser,
  type AuthUser,
} from '@/features/auth/types';
import {
  ensureUserDocument,
  fetchUserDocument,
  migrateAnonymousUserData,
  upgradeUserDocument,
} from '@/features/auth/services/userService';
import { ProfileModel } from '@/features/player-profile/models/ProfileModel';
import { UserModel } from '@/features/player-profile/models/UserModel';

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    return false;
  }

  try {
    const AppleAuthentication = await import('expo-apple-authentication');
    return AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

async function resolveAuthUserFromFirestore(user: User): Promise<AuthUser> {
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
    isAnonymous: false,
    displayName: user.displayName ?? 'ScoutX User',
    email: user.email ?? undefined,
  });
}

function mapAppleAuthError(error: unknown): AuthError | null {
  if (error instanceof AuthError) {
    return error;
  }

  if (error instanceof Error && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') {
    return null;
  }

  const message = error instanceof Error ? error.message : 'Apple Sign In failed.';
  return new AuthError(message, 'invalid-credentials');
}

export async function signInWithAppleFirebase(): Promise<AuthUser | null> {
  if (!isFirebaseReady()) {
    throw new AuthError('Apple Sign In requires Firebase.', 'invalid-credentials');
  }

  const auth = getFirebaseAuth();
  const db = getFirestoreDb();
  if (!auth || !db) {
    throw new AuthError('Firebase authentication is not configured.', 'invalid-credentials');
  }

  const available = await isAppleSignInAvailable();
  if (!available) {
    throw new AuthError('Apple Sign In is not available on this device.', 'invalid-credentials');
  }

  try {
    const AppleAuthentication = await import('expo-apple-authentication');
    const appleResult = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!appleResult.identityToken) {
      return null;
    }

    const provider = new OAuthProvider('apple.com');
    const oauthCredential = provider.credential({
      idToken: appleResult.identityToken,
    });

    const displayName =
      [appleResult.fullName?.givenName, appleResult.fullName?.familyName]
        .filter(Boolean)
        .join(' ')
        .trim() || undefined;

    const anonymousUser = auth.currentUser;

    if (anonymousUser?.isAnonymous) {
      try {
        const linked = await linkWithCredential(anonymousUser, oauthCredential);
        if (displayName) {
          await updateProfile(linked.user, { displayName });
        }

        const userDoc = await upgradeUserDocument(linked.user.uid, {
          name: displayName ?? linked.user.displayName ?? 'ScoutX User',
          email: linked.user.email ?? '',
        });

        const profileRef = doc(db, 'profiles', linked.user.uid);
        const profileSnap = await getDoc(profileRef);
        if (!profileSnap.exists()) {
          const defaultProfile = ProfileModel.getDefaultProfile(
            linked.user.uid,
            linked.user.email ?? '',
          );
          if (displayName) {
            defaultProfile.fullName = displayName;
          }
          await setDoc(profileRef, ProfileModel.toFirestore(defaultProfile));
        }

        return createAuthUser({
          uid: userDoc.uid,
          isAnonymous: false,
          displayName: userDoc.name,
          email: userDoc.email || undefined,
          role: userDoc.role === 'guest' ? undefined : userDoc.role,
        });
      } catch (linkError) {
        if (
          linkError instanceof Error &&
          'code' in linkError &&
          (String(linkError.code).includes('credential-already-in-use') ||
            String(linkError.code).includes('email-already-in-use'))
        ) {
          const anonymousUid = anonymousUser.uid;
          const signedIn = await signInWithCredential(auth, oauthCredential);
          await migrateAnonymousUserData(anonymousUid, signedIn.user.uid);
          return resolveAuthUserFromFirestore(signedIn.user);
        }
        throw linkError;
      }
    }

    const signedIn = await signInWithCredential(auth, oauthCredential);

    if (displayName && !signedIn.user.displayName) {
      await updateProfile(signedIn.user, { displayName });
    }

    const existingDoc = await fetchUserDocument(signedIn.user.uid);
    if (!existingDoc) {
      await ensureUserDocument({
        uid: signedIn.user.uid,
        name: displayName ?? signedIn.user.displayName ?? 'ScoutX User',
        email: signedIn.user.email ?? '',
        isAnonymous: false,
      });

      const profileRef = doc(db, 'profiles', signedIn.user.uid);
      const profileSnap = await getDoc(profileRef);
      if (!profileSnap.exists()) {
        const defaultProfile = ProfileModel.getDefaultProfile(
          signedIn.user.uid,
          signedIn.user.email ?? '',
        );
        if (displayName) {
          defaultProfile.fullName = displayName;
        }
        await setDoc(profileRef, ProfileModel.toFirestore(defaultProfile));
      }
    }

    return resolveAuthUserFromFirestore(signedIn.user);
  } catch (error) {
    const mapped = mapAppleAuthError(error);
    if (!mapped) {
      return null;
    }
    throw mapped;
  }
}

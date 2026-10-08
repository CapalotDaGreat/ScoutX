import { EmailAuthProvider, reauthenticateWithCredential, type User } from 'firebase/auth';
import { getFirebaseAuth } from '@/config/firebase';
import { requestAppleOAuthCredential } from '@/features/auth/services/appleAuthService';
import { persistAppleAuthorizationCode } from '@/features/auth/services/appleTokenPersistenceService';
import { requestGoogleOAuthCredential } from '@/features/auth/services/googleAuthService';

import {
  classifyReauthError,
  ReauthError,
  reauthMethodsFor,
  type ReauthMethod,
} from '@/features/auth/services/reauthModel';

export { classifyReauthError, type ReauthFailure, type ReauthMethod } from '@/features/auth/services/reauthModel';

function currentUser(): User {
  const user = getFirebaseAuth()?.currentUser;
  if (!user) throw new ReauthError('failed');
  return user;
}

export function currentReauthMethods(): ReauthMethod[] {
  const user = getFirebaseAuth()?.currentUser;
  return user ? reauthMethodsFor(user.providerData.map((provider) => provider.providerId)) : [];
}

/** Proves the current user's identity again so the next ID token carries a fresh `auth_time`. */
export async function reauthenticate(method: ReauthMethod, password?: string): Promise<void> {
  const user = currentUser();
  try {
    if (method === 'password') {
      if (!user.email || !password) throw new ReauthError('wrong_password');
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    } else {
      const bundle = method === 'apple.com' ? await requestAppleOAuthCredential() : await requestGoogleOAuthCredential();
      if (!bundle) throw new ReauthError('cancelled');
      await reauthenticateWithCredential(user, bundle.credential);
      if (bundle.appleAuthorizationCode) {
        // A fresh code keeps Apple token revocation working during the deletion that follows.
        await persistAppleAuthorizationCode({ authorizationCode: bundle.appleAuthorizationCode, appleUserId: bundle.appleUserId });
      }
    }
    await user.getIdToken(true);
  } catch (error) {
    throw new ReauthError(classifyReauthError(error));
  }
}

import { Platform } from 'react-native';
import { OAuthProvider } from 'firebase/auth';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import { getFirebaseAuth, isFirebaseReady } from '@/config/firebase';
import { assertProductionAuthConfigured } from '@/config/authSecurity';
import { mapAppleAuthError } from '@/features/auth/services/authErrorMapping';
import { generateRawOAuthNonce, hashOAuthNonce } from '@/features/auth/services/oauth/oauthNonce';
import {
  clearOAuthPendingState,
  createOAuthPendingState,
  resolveOAuthRawNonce,
} from '@/features/auth/services/oauth/oauthSecureStateService';
import { secureStorageService } from '@/services/secureStorage';
import {
  isOAuthProviderLinkedForCurrentUser,
  signInOrLinkOAuthCredential,
} from '@/features/auth/services/oauth/oauthAccountLinking';
import type { OAuthCredentialBundle } from '@/features/auth/services/oauth/types';
import { persistAppleAuthorizationCode } from '@/features/auth/services/appleTokenPersistenceService';
import { AuthError, type AuthUser } from '@/features/auth/types';

const APPLE_PROVIDER_ID = 'apple.com' as const;

export type AppleSignInEnvironment = 'expo-go' | 'development-build' | 'standalone' | 'unsupported';

function buildAppleDisplayName(
  fullName: AppleAuthentication.AppleAuthenticationCredential['fullName'],
): string | undefined {
  const displayName = [fullName?.givenName, fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();

  return displayName || undefined;
}

export function isAppleSignInSupportedPlatform(): boolean {
  return Platform.OS === 'ios';
}

export function getAppleSignInEnvironment(): AppleSignInEnvironment {
  if (!isAppleSignInSupportedPlatform()) {
    return 'unsupported';
  }

  const executionEnvironment = Constants.executionEnvironment;

  if (executionEnvironment === 'storeClient') {
    return 'expo-go';
  }

  if (executionEnvironment === 'bare' || executionEnvironment === 'standalone') {
    return 'standalone';
  }

  return 'development-build';
}

/**
 * Sign in with Apple works in Expo Go on supported iOS devices via the Expo Go binary.
 * Full App Store compliance (token revoke on delete) requires a development/EAS build with Functions secrets.
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (!isAppleSignInSupportedPlatform()) {
    return false;
  }

  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getAppleCredentialState(
  appleUserId: string,
): Promise<AppleAuthentication.AppleAuthenticationCredentialState | null> {
  if (!isAppleSignInSupportedPlatform()) {
    return null;
  }

  try {
    return await AppleAuthentication.getCredentialStateAsync(appleUserId);
  } catch {
    return null;
  }
}

async function buildAppleNonce(): Promise<{
  state: string;
  rawNonce: string;
  hashedNonce: string;
}> {
  if (await secureStorageService.isAvailable()) {
    return createOAuthPendingState();
  }

  const state = generateRawOAuthNonce();
  const rawNonce = generateRawOAuthNonce();
  const hashedNonce = await hashOAuthNonce(rawNonce);
  return { state, rawNonce, hashedNonce };
}

export async function requestAppleOAuthCredential(): Promise<OAuthCredentialBundle | null> {
  const available = await isAppleSignInAvailable();
  if (!available) {
    throw new AuthError('Apple Sign In is not available on this device.', 'invalid-credentials');
  }

  const { state, rawNonce: pendingRawNonce, hashedNonce } = await buildAppleNonce();

  try {
    const appleResult = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!appleResult.identityToken) {
      return null;
    }

    const rawNonce = await resolveOAuthRawNonce({
      state,
      fallbackRawNonce: pendingRawNonce,
    });

    const provider = new OAuthProvider(APPLE_PROVIDER_ID);
    const credential = provider.credential({
      idToken: appleResult.identityToken,
      rawNonce,
    });

    return {
      providerId: APPLE_PROVIDER_ID,
      credential,
      displayName: buildAppleDisplayName(appleResult.fullName),
      email: appleResult.email ?? undefined,
      appleAuthorizationCode: appleResult.authorizationCode ?? undefined,
      appleUserId: appleResult.user || undefined,
    };
  } finally {
    await clearOAuthPendingState();
  }
}

async function finalizeAppleSession(
  user: AuthUser,
  bundle: OAuthCredentialBundle,
): Promise<AuthUser> {
  if (bundle.appleAuthorizationCode) {
    await persistAppleAuthorizationCode({
      authorizationCode: bundle.appleAuthorizationCode,
      appleUserId: bundle.appleUserId,
    });
  }

  return user;
}

export function isAppleLinkedToCurrentAccount(): boolean {
  return isOAuthProviderLinkedForCurrentUser(APPLE_PROVIDER_ID);
}

export async function signInWithAppleFirebase(): Promise<AuthUser | null> {
  assertProductionAuthConfigured();

  if (!isFirebaseReady()) {
    throw new AuthError('Apple Sign In requires Firebase.', 'invalid-credentials');
  }

  const auth = getFirebaseAuth();
  if (!auth) {
    throw new AuthError('Firebase authentication is not configured.', 'invalid-credentials');
  }

  try {
    const bundle = await requestAppleOAuthCredential();
    if (!bundle) {
      return null;
    }

    const user = await signInOrLinkOAuthCredential(bundle.credential, bundle.providerId, {
      displayName: bundle.displayName,
      email: bundle.email,
    });

    return finalizeAppleSession(user, bundle);
  } catch (error) {
    const mapped = mapAppleAuthError(error);
    if (!mapped) {
      return null;
    }
    throw mapped;
  }
}

export async function linkAppleToCurrentAccount(): Promise<AuthUser> {
  assertProductionAuthConfigured();

  if (!isFirebaseReady()) {
    throw new AuthError('Apple Sign In requires Firebase.', 'invalid-credentials');
  }

  const auth = getFirebaseAuth();
  const currentUser = auth?.currentUser;

  if (!currentUser || currentUser.isAnonymous) {
    throw new AuthError('Sign in before linking Apple to your account.', 'invalid-credentials');
  }

  if (isAppleLinkedToCurrentAccount()) {
    throw new AuthError('Apple Sign In is already linked to this account.', 'credential-already-in-use');
  }

  try {
    const bundle = await requestAppleOAuthCredential();
    if (!bundle) {
      throw new AuthError('Apple Sign In was cancelled.', 'invalid-credentials');
    }

    const user = await signInOrLinkOAuthCredential(bundle.credential, bundle.providerId, {
      displayName: bundle.displayName,
      email: bundle.email,
    });

    return finalizeAppleSession(user, bundle);
  } catch (error) {
    const mapped = mapAppleAuthError(error);
    if (!mapped) {
      throw new AuthError('Apple Sign In was cancelled.', 'invalid-credentials');
    }
    throw mapped;
  }
}

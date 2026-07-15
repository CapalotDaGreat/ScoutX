import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { GoogleAuthProvider } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseReady } from '@/config/firebase';
import {
  getGoogleIosClientId,
  getGoogleWebClientId,
  isGoogleAuthConfigured,
} from '@/config/googleAuth';
import { assertProductionAuthConfigured } from '@/config/authSecurity';
import { mapGoogleAuthError } from '@/features/auth/services/authErrorMapping';
import {
  isOAuthProviderLinkedForCurrentUser,
  signInOrLinkOAuthCredential,
} from '@/features/auth/services/oauth/oauthAccountLinking';
import type { OAuthCredentialBundle } from '@/features/auth/services/oauth/types';
import { AuthError, type AuthUser } from '@/features/auth/types';

const GOOGLE_PROVIDER_ID = 'google.com' as const;

export type GoogleSignInEnvironment =
  | 'expo-go'
  | 'development-build'
  | 'standalone'
  | 'unsupported';

type GoogleSignInModule = typeof import('@react-native-google-signin/google-signin');

let googleSignInModule: GoogleSignInModule | null | undefined;
let googleSignInConfigured = false;

function isExpoGoRuntime(): boolean {
  return Constants.executionEnvironment === 'storeClient';
}

export function getGoogleSignInEnvironment(): GoogleSignInEnvironment {
  if (Platform.OS === 'web') {
    return 'unsupported';
  }

  if (!isGoogleSignInSupportedPlatform()) {
    return 'unsupported';
  }

  if (isExpoGoRuntime()) {
    return 'expo-go';
  }

  const executionEnvironment = Constants.executionEnvironment;
  if (executionEnvironment === 'bare' || executionEnvironment === 'standalone') {
    return 'standalone';
  }

  return 'development-build';
}

async function loadGoogleSignInModule(): Promise<GoogleSignInModule | null> {
  if (googleSignInModule !== undefined) {
    return googleSignInModule;
  }

  if (Platform.OS === 'web' || isExpoGoRuntime()) {
    googleSignInModule = null;
    return null;
  }

  try {
    googleSignInModule = await import('@react-native-google-signin/google-signin');
    return googleSignInModule;
  } catch {
    googleSignInModule = null;
    return null;
  }
}

export function isGoogleSignInSupportedPlatform(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/**
 * Google Sign-In requires a development or EAS build with the Expo config plugin.
 * Expo Go cannot load the native module (Expo official guidance for SDK 54).
 */
export async function isGoogleSignInAvailable(): Promise<boolean> {
  if (!isGoogleSignInSupportedPlatform() || !isGoogleAuthConfigured()) {
    return false;
  }

  if (isExpoGoRuntime()) {
    return false;
  }

  const module = await loadGoogleSignInModule();
  return module !== null;
}

async function ensureGoogleSignInConfigured(module: GoogleSignInModule): Promise<void> {
  if (googleSignInConfigured) {
    return;
  }

  const webClientId = getGoogleWebClientId();
  if (!webClientId) {
    throw new AuthError('Google Sign-In is not configured for this build.', 'invalid-credentials');
  }

  module.GoogleSignin.configure({
    webClientId,
    iosClientId: getGoogleIosClientId() ?? undefined,
    offlineAccess: false,
    forceCodeForRefreshToken: false,
  });

  googleSignInConfigured = true;
}

function buildGoogleDisplayName(user: {
  name?: string | null;
  givenName?: string | null;
  familyName?: string | null;
}): string | undefined {
  const displayName =
    user.name?.trim() || [user.givenName, user.familyName].filter(Boolean).join(' ').trim();

  return displayName || undefined;
}

export async function requestGoogleOAuthCredential(): Promise<OAuthCredentialBundle | null> {
  const module = await loadGoogleSignInModule();
  if (!module) {
    throw new AuthError(
      'Google Sign-In requires a development or production build. It is not available in Expo Go.',
      'invalid-credentials',
    );
  }

  await ensureGoogleSignInConfigured(module);

  if (Platform.OS === 'android') {
    await module.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  const response = await module.GoogleSignin.signIn();

  if (module.isCancelledResponse(response)) {
    return null;
  }

  if (!module.isSuccessResponse(response)) {
    throw new AuthError('Google Sign-In did not return account credentials.', 'invalid-credentials');
  }

  const idToken = response.data.idToken;
  if (!idToken) {
    throw new AuthError(
      'Google Sign-In did not return an ID token. Verify EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is the Firebase Web client ID.',
      'invalid-credentials',
    );
  }

  const credential = GoogleAuthProvider.credential(idToken);

  return {
    providerId: GOOGLE_PROVIDER_ID,
    credential,
    displayName: buildGoogleDisplayName(response.data.user),
    email: response.data.user.email ?? undefined,
  };
}

export function isGoogleLinkedToCurrentAccount(): boolean {
  return isOAuthProviderLinkedForCurrentUser(GOOGLE_PROVIDER_ID);
}

/**
 * Clears the native Google session so the next sign-in can pick a different account.
 * Safe to call when Google Sign-In is unavailable (Expo Go / web).
 */
export async function clearGoogleSignInSession(): Promise<void> {
  const module = await loadGoogleSignInModule();
  if (!module) {
    return;
  }

  try {
    await ensureGoogleSignInConfigured(module);
    await module.GoogleSignin.signOut();
  } catch {
    // Ignore — Firebase Auth is the source of truth for ScoutX sessions.
  }
}

export async function signInWithGoogleFirebase(): Promise<AuthUser | null> {
  assertProductionAuthConfigured();

  if (!isFirebaseReady()) {
    throw new AuthError('Google Sign-In requires Firebase.', 'invalid-credentials');
  }

  const auth = getFirebaseAuth();
  if (!auth) {
    throw new AuthError('Firebase authentication is not configured.', 'invalid-credentials');
  }

  try {
    const bundle = await requestGoogleOAuthCredential();
    if (!bundle) {
      return null;
    }

    return signInOrLinkOAuthCredential(bundle.credential, bundle.providerId, {
      displayName: bundle.displayName,
      email: bundle.email,
    });
  } catch (error) {
    const mapped = mapGoogleAuthError(error);
    if (!mapped) {
      return null;
    }
    throw mapped;
  }
}

export async function linkGoogleToCurrentAccount(): Promise<AuthUser> {
  assertProductionAuthConfigured();

  if (!isFirebaseReady()) {
    throw new AuthError('Google Sign-In requires Firebase.', 'invalid-credentials');
  }

  const auth = getFirebaseAuth();
  const currentUser = auth?.currentUser;

  if (!currentUser || currentUser.isAnonymous) {
    throw new AuthError('Sign in before linking Google to your account.', 'invalid-credentials');
  }

  if (isGoogleLinkedToCurrentAccount()) {
    throw new AuthError('Google Sign-In is already linked to this account.', 'credential-already-in-use');
  }

  try {
    const bundle = await requestGoogleOAuthCredential();
    if (!bundle) {
      throw new AuthError('Google Sign-In was cancelled.', 'invalid-credentials');
    }

    return signInOrLinkOAuthCredential(bundle.credential, bundle.providerId, {
      displayName: bundle.displayName,
      email: bundle.email,
    });
  } catch (error) {
    const mapped = mapGoogleAuthError(error);
    if (!mapped) {
      throw new AuthError('Google Sign-In was cancelled.', 'invalid-credentials');
    }
    throw mapped;
  }
}

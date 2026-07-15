import { isFirebaseReady } from '@/config/firebase';
import { isProductionApp } from '@/config/appMode';
import { AuthError } from '@/features/auth/types';

/**
 * Mock authentication is for local / Expo Go demos (same idea as Trading_App's
 * DEMO_USER when Firebase Auth isn't ready). Production builds must fail closed.
 *
 * Expo Go (`EXPO_PUBLIC_EXPO_GO=1`) defaults to local guest because this Firebase
 * project may not have Authentication enabled yet (`auth/configuration-not-found`).
 * Set EXPO_PUBLIC_FORCE_FIREBASE_AUTH=true after enabling Anonymous in Firebase Console.
 */
export function shouldUseMockAuth(): boolean {
  if (isProductionApp()) {
    return false;
  }

  if (!isFirebaseReady()) {
    return true;
  }

  const isExpoGo = process.env.EXPO_PUBLIC_EXPO_GO === '1';
  const forceFirebaseAuth = process.env.EXPO_PUBLIC_FORCE_FIREBASE_AUTH === 'true';
  return isExpoGo && !forceFirebaseAuth;
}

export function assertProductionAuthConfigured(): void {
  if (isProductionApp() && !isFirebaseReady()) {
    throw new AuthError(
      'Authentication is unavailable because Firebase is not configured.',
      'invalid-credentials',
    );
  }
}

export const FORBIDDEN_CREDENTIAL_FIELDS = [
  'password',
  'passwordHash',
  'passwordSalt',
  'credentials',
  'secret',
  'apiKey',
] as const;

export const PASSWORD_RESET_SUCCESS_MESSAGE =
  'If an account exists for this email, a password reset link has been sent.';

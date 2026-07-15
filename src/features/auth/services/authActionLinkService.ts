import {
  applyActionCode,
  confirmPasswordReset,
  sendEmailVerification,
  verifyPasswordResetCode,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseReady } from '@/config/firebase';
import { assertProductionAuthConfigured } from '@/config/authSecurity';
import { getFirebaseActionCodeSettings } from '@/config/deepLinking';
import { mapFirebaseAuthError } from '@/features/auth/services/authErrorMapping';
import { AuthError } from '@/features/auth/types';
import type { FirebaseAuthActionMode, ParsedAuthActionLink } from '@/config/deepLinking';

export type AuthActionResult =
  | { status: 'verified-email' }
  | { status: 'recovered-email' }
  | { status: 'reset-password-ready'; email?: string }
  | { status: 'completed-password-reset' }
  | { status: 'unsupported-mode'; mode: FirebaseAuthActionMode };

export async function sendVerificationEmailForUser(user: User): Promise<void> {
  assertProductionAuthConfigured();

  if (!isFirebaseReady()) {
    throw new AuthError('Email verification requires Firebase.', 'invalid-credentials');
  }

  try {
    await sendEmailVerification(user, getFirebaseActionCodeSettings());
  } catch (error) {
    throw mapFirebaseAuthError(error);
  }
}

export async function handleAuthActionLink(action: ParsedAuthActionLink): Promise<AuthActionResult> {
  assertProductionAuthConfigured();

  const auth = getFirebaseAuth();
  if (!auth) {
    throw new AuthError('Firebase authentication is not configured.', 'invalid-credentials');
  }

  try {
    switch (action.mode) {
      case 'verifyEmail': {
        await applyActionCode(auth, action.oobCode);
        if (auth.currentUser) {
          await auth.currentUser.reload();
        }
        return { status: 'verified-email' };
      }
      case 'recoverEmail': {
        await applyActionCode(auth, action.oobCode);
        return { status: 'recovered-email' };
      }
      case 'resetPassword': {
        const email = await verifyPasswordResetCode(auth, action.oobCode);
        return { status: 'reset-password-ready', email: email ?? undefined };
      }
      case 'signIn':
      case 'revertSecondFactorAddition':
        return { status: 'unsupported-mode', mode: action.mode };
      default:
        return { status: 'unsupported-mode', mode: action.mode };
    }
  } catch (error) {
    throw mapFirebaseAuthError(error);
  }
}

export async function completePasswordResetWithCode(
  oobCode: string,
  newPassword: string,
): Promise<AuthActionResult> {
  assertProductionAuthConfigured();

  const auth = getFirebaseAuth();
  if (!auth) {
    throw new AuthError('Firebase authentication is not configured.', 'invalid-credentials');
  }

  if (newPassword.length < 8) {
    throw new AuthError('Password must be at least 8 characters long.', 'weak-password');
  }

  try {
    await confirmPasswordReset(auth, oobCode, newPassword);
    return { status: 'completed-password-reset' };
  } catch (error) {
    throw mapFirebaseAuthError(error);
  }
}

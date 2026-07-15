import { AuthError } from '@/features/auth/types';

function getFirebaseErrorCode(error: unknown): string {
  if (error instanceof Error && 'code' in error) {
    return String(error.code);
  }
  return '';
}

function getFirebaseErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return '';
}

function includesCodeOrMessage(value: string, code: string, message: string): boolean {
  return code.includes(value) || message.includes(value);
}

export function mapFirebaseAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) {
    return error;
  }

  const message = getFirebaseErrorMessage(error);
  const code = getFirebaseErrorCode(error);

  if (includesCodeOrMessage('invalid-email', code, message)) {
    return new AuthError('Please enter a valid email address.', 'invalid-email');
  }

  if (
    includesCodeOrMessage('wrong-password', code, message) ||
    includesCodeOrMessage('invalid-credential', code, message) ||
    includesCodeOrMessage('user-not-found', code, message)
  ) {
    return new AuthError('The email or password is incorrect.', 'invalid-credentials');
  }

  if (includesCodeOrMessage('email-already-in-use', code, message)) {
    return new AuthError('This email is already registered.', 'email-in-use');
  }

  if (includesCodeOrMessage('credential-already-in-use', code, message)) {
    return new AuthError('This email is already linked to another account.', 'credential-already-in-use');
  }

  if (includesCodeOrMessage('account-exists-with-different-credential', code, message)) {
    return new AuthError(
      'An account with this email already exists. Sign in with your existing method first, then link your provider in Settings.',
      'account-exists-with-different-credential',
    );
  }

  if (includesCodeOrMessage('weak-password', code, message)) {
    return new AuthError('Password must be at least 8 characters long.', 'weak-password');
  }

  if (includesCodeOrMessage('requires-recent-login', code, message)) {
    return new AuthError(
      'For your security, please sign in again before continuing.',
      'requires-recent-login',
    );
  }

  if (
    includesCodeOrMessage('admin-restricted-operation', code, message) ||
    includesCodeOrMessage('operation-not-allowed', code, message)
  ) {
    return new AuthError(
      'Anonymous sign-in is disabled for this Firebase project. Enable it in the Firebase console.',
      'anonymous-disabled',
    );
  }

  if (includesCodeOrMessage('configuration-not-found', code, message)) {
    return new AuthError(
      'Firebase Authentication is not configured for this project. Open Firebase Console → Authentication and click Get started, then enable Anonymous sign-in.',
      'anonymous-disabled',
    );
  }

  if (
    includesCodeOrMessage('network-request-failed', code, message) ||
    includesCodeOrMessage('network error', code, message)
  ) {
    return new AuthError(
      'Network error while signing in. Check your connection and try again.',
      'invalid-credentials',
    );
  }

  if (includesCodeOrMessage('too-many-requests', code, message)) {
    return new AuthError('Too many attempts. Please wait and try again.', 'invalid-credentials');
  }

  if (__DEV__ && (code || message)) {
    console.warn('[auth] Unmapped Firebase auth error', { code, message });
  }

  return new AuthError('Authentication failed. Please try again.', 'invalid-credentials');
}

export function mapFirebasePasswordResetError(error: unknown): AuthError | null {
  if (error instanceof AuthError) {
    return error.code === 'invalid-email' ? error : null;
  }

  const message = getFirebaseErrorMessage(error);
  const code = getFirebaseErrorCode(error);

  if (includesCodeOrMessage('invalid-email', code, message)) {
    return new AuthError('Please enter a valid email address.', 'invalid-email');
  }

  // Never reveal whether an account exists for the submitted email.
  return null;
}

export function mapAccountDeletionError(error: unknown): AuthError {
  const mapped = mapFirebaseAuthError(error);
  if (mapped.code === 'requires-recent-login') {
    return mapped;
  }

  return new AuthError(
    'Unable to delete your account. Sign in again and retry, or contact support.',
    'invalid-credentials',
  );
}

export function mapAppleAuthError(error: unknown): AuthError | null {
  if (error instanceof AuthError) {
    return error;
  }

  if (error instanceof Error && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') {
    return null;
  }

  const mapped = mapFirebaseAuthError(error);
  if (mapped.code !== 'invalid-credentials' || getFirebaseErrorCode(error)) {
    return mapped;
  }

  return new AuthError('Apple Sign In failed. Please try again.', 'invalid-credentials');
}

export function mapGoogleAuthError(error: unknown): AuthError | null {
  if (error instanceof AuthError) {
    return error;
  }

  const code = getFirebaseErrorCode(error);

  if (code.includes('SIGN_IN_CANCELLED') || code.includes('12501')) {
    return null;
  }

  if (code.includes('IN_PROGRESS')) {
    return new AuthError('Google Sign-In is already in progress.', 'invalid-credentials');
  }

  if (code.includes('PLAY_SERVICES_NOT_AVAILABLE')) {
    return new AuthError('Google Play services are unavailable or outdated on this device.', 'invalid-credentials');
  }

  const mapped = mapFirebaseAuthError(error);
  if (mapped.code !== 'invalid-credentials' || code) {
    return mapped;
  }

  return new AuthError('Google Sign-In failed. Please try again.', 'invalid-credentials');
}

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseReady } from '@/config/firebase';
import { assertProductionAuthConfigured } from '@/config/authSecurity';
import { mapFirebaseAuthError } from '@/features/auth/services/authErrorMapping';
import { AuthError } from '@/features/auth/types';

export type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

function validateChangePasswordPayload(payload: ChangePasswordPayload): void {
  if (!payload.currentPassword.trim()) {
    throw new AuthError('Current password is required.', 'invalid-credentials');
  }

  if (!payload.newPassword.trim()) {
    throw new AuthError('New password is required.', 'weak-password');
  }

  if (payload.newPassword.length < 8) {
    throw new AuthError('Password must be at least 8 characters long.', 'weak-password');
  }

  if (payload.newPassword !== payload.confirmPassword) {
    throw new AuthError('Passwords do not match.', 'password-mismatch');
  }

  if (payload.currentPassword === payload.newPassword) {
    throw new AuthError('Choose a different password than your current one.', 'weak-password');
  }
}

export async function changePasswordWithFirebase(
  payload: ChangePasswordPayload,
  email: string,
): Promise<void> {
  assertProductionAuthConfigured();

  if (!isFirebaseReady()) {
    throw new AuthError('Password changes require Firebase Authentication.', 'invalid-credentials');
  }

  validateChangePasswordPayload(payload);

  const auth = getFirebaseAuth();
  const user = auth?.currentUser;

  if (!user?.email) {
    throw new AuthError('You must be signed in with email to change your password.', 'invalid-credentials');
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (user.email.trim().toLowerCase() !== normalizedEmail) {
    throw new AuthError('Account email mismatch. Sign out and sign in again.', 'invalid-credentials');
  }

  try {
    const credential = EmailAuthProvider.credential(normalizedEmail, payload.currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, payload.newPassword);
  } catch (error) {
    throw mapFirebaseAuthError(error);
  }
}

import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseReady } from '@/config/firebase';
import {
  AuthError,
  type AuthUser,
  type ForgotPasswordPayload,
  type SignInPayload,
  type SignUpPayload,
} from '@/features/auth/types';

function toAuthUser(user: User | null): AuthUser | null {
  if (!user) {
    return null;
  }

  return {
    id: user.uid,
    name: user.displayName ?? user.email?.split('@')[0] ?? 'ScoutX User',
    email: user.email ?? '',
  };
}

function mapFirebaseError(error: unknown): AuthError {
  if (error instanceof AuthError) {
    return error;
  }

  const message = error instanceof Error ? error.message : 'Authentication failed.';

  if (message.includes('invalid-email')) {
    return new AuthError('Please enter a valid email address.', 'invalid-email');
  }

  if (message.includes('wrong-password') || message.includes('invalid-credential')) {
    return new AuthError('The email or password is incorrect.', 'invalid-credentials');
  }

  if (message.includes('email-already-in-use')) {
    return new AuthError('This email is already registered.', 'email-in-use');
  }

  if (message.includes('weak-password')) {
    return new AuthError('Password must be at least 8 characters long.', 'weak-password');
  }

  if (message.includes('user-not-found')) {
    return new AuthError('We could not find an account for this email.', 'not-found');
  }

  return new AuthError(message, 'invalid-credentials');
}

export function initializeAuthListener(callback: (user: AuthUser | null) => void): () => void {
  const auth = getFirebaseAuth();
  if (!auth || !isFirebaseReady()) {
    callback(null);
    return () => undefined;
  }

  return onAuthStateChanged(auth, (user) => {
    callback(toAuthUser(user));
  });
}

export async function signInWithFirebase(payload: SignInPayload): Promise<AuthUser> {
  const auth = getFirebaseAuth();
  if (!auth || !isFirebaseReady()) {
    throw new AuthError('Firebase authentication is not configured.', 'invalid-credentials');
  }

  try {
    const credential = await signInWithEmailAndPassword(auth, payload.email, payload.password);
    const user = toAuthUser(credential.user);
    if (!user) {
      throw new AuthError('Unable to sign in.', 'invalid-credentials');
    }
    return user;
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

export async function signUpWithFirebase(payload: SignUpPayload): Promise<AuthUser> {
  const auth = getFirebaseAuth();
  if (!auth || !isFirebaseReady()) {
    throw new AuthError('Firebase authentication is not configured.', 'invalid-credentials');
  }

  try {
    const credential = await createUserWithEmailAndPassword(auth, payload.email, payload.password);
    const user = toAuthUser(credential.user);
    if (!user) {
      throw new AuthError('Unable to create the account.', 'invalid-credentials');
    }
    return user;
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

export async function resetPasswordWithFirebase(payload: ForgotPasswordPayload): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth || !isFirebaseReady()) {
    throw new AuthError('Firebase authentication is not configured.', 'invalid-credentials');
  }

  try {
    await sendPasswordResetEmail(auth, payload.email);
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

export async function signOutFromFirebase(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth || !isFirebaseReady()) {
    return;
  }

  await firebaseSignOut(auth);
}

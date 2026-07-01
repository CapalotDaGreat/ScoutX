import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb, isFirebaseReady } from '@/config/firebase';
import {
  AuthError,
  type AuthUser,
  type ForgotPasswordPayload,
  type SignInPayload,
  type SignUpPayload,
} from '@/features/auth/types';
import { UserModel } from '@/features/player-profile/models/UserModel';
import { ProfileModel } from '@/features/player-profile/models/ProfileModel';

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
  const db = getFirestoreDb();
  if (!auth || !db || !isFirebaseReady()) {
    callback(null);
    return () => undefined;
  }

  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null);
      return;
    }

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const userModel = UserModel.fromFirestore(user.uid, userData);
        callback(userModel.toAuthUser());
      } else {
        callback(toAuthUser(user));
      }
    } catch (error) {
      console.error('Error fetching user doc in auth listener:', error);
      callback(toAuthUser(user));
    }
  });
}

export async function signInWithFirebase(payload: SignInPayload): Promise<AuthUser> {
  const auth = getFirebaseAuth();
  const db = getFirestoreDb();
  if (!auth || !db || !isFirebaseReady()) {
    throw new AuthError('Firebase authentication is not configured.', 'invalid-credentials');
  }

  try {
    const credential = await signInWithEmailAndPassword(auth, payload.email, payload.password);
    const baseUser = toAuthUser(credential.user);
    if (!baseUser) {
      throw new AuthError('Unable to sign in.', 'invalid-credentials');
    }

    const userDocRef = doc(db, 'users', credential.user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const userData = userDocSnap.data();
      const userModel = UserModel.fromFirestore(credential.user.uid, userData);
      return userModel.toAuthUser();
    }
    return baseUser;
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

export async function signUpWithFirebase(payload: SignUpPayload): Promise<AuthUser> {
  const auth = getFirebaseAuth();
  const db = getFirestoreDb();
  if (!auth || !db || !isFirebaseReady()) {
    throw new AuthError('Firebase authentication is not configured.', 'invalid-credentials');
  }

  try {
    const credential = await createUserWithEmailAndPassword(auth, payload.email, payload.password);
    const user = toAuthUser(credential.user);
    if (!user) {
      throw new AuthError('Unable to create the account.', 'invalid-credentials');
    }

    // Save user info to users collection in Firestore
    await setDoc(doc(db, 'users', user.id), {
      name: payload.fullName || user.name,
      email: user.email,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Also initialize their profile with the default profile
    const defaultProfile = ProfileModel.getDefaultProfile(user.id, user.email);
    defaultProfile.fullName = payload.fullName || user.name;
    await setDoc(doc(db, 'profiles', user.id), ProfileModel.toFirestore(defaultProfile));

    return {
      ...user,
      name: payload.fullName || user.name,
    };
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


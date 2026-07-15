import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AuthError,
  createAuthUser,
  type AuthUser,
  type ForgotPasswordPayload,
  type SignInPayload,
  type SignUpPayload,
} from '@/features/auth/types';

const GUEST_SESSION_KEY = '@scoutx/mock-guest-session';

type MockCredentialUser = AuthUser & { password: string };

// Expo only inlines static process.env.EXPO_PUBLIC_* references (not env[key]).
const mockDemoPassword = process.env.EXPO_PUBLIC_MOCK_DEMO_PASSWORD?.trim() ?? '';

const mockUsers: MockCredentialUser[] = [];

if (__DEV__ && mockDemoPassword) {
  mockUsers.push(
    {
      uid: 'demo-player',
      id: 'demo-player',
      isAnonymous: false,
      name: 'Alex Rivera',
      displayName: 'Alex Rivera',
      email: 'player@scoutx.app',
      password: mockDemoPassword,
      role: 'player',
    },
    {
      uid: 'demo-scout',
      id: 'demo-scout',
      isAnonymous: false,
      name: 'Mina Chen',
      displayName: 'Mina Chen',
      email: 'scout@scoutx.app',
      password: mockDemoPassword,
      role: 'scout',
    },
  );
}

let activeGuestSession: AuthUser | null = null;
let sessionListeners: Array<(user: AuthUser | null) => void> = [];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /.+@.+\..+/.test(email);
}

function notifySessionListeners(user: AuthUser | null) {
  sessionListeners.forEach((listener) => listener(user));
}

async function persistGuestSession(user: AuthUser | null): Promise<void> {
  activeGuestSession = user;
  if (user) {
    const { uid, id, isAnonymous, displayName, name, email, role } = user;
    await AsyncStorage.setItem(
      GUEST_SESSION_KEY,
      JSON.stringify({ uid, id, isAnonymous, displayName, name, email, role }),
    );
  } else {
    await AsyncStorage.removeItem(GUEST_SESSION_KEY);
  }
  notifySessionListeners(user);
}

export function subscribeToMockAuthSession(callback: (user: AuthUser | null) => void): () => void {
  sessionListeners.push(callback);
  callback(activeGuestSession);
  return () => {
    sessionListeners = sessionListeners.filter((listener) => listener !== callback);
  };
}

export async function mockInitializeSession(): Promise<AuthUser | null> {
  await wait(300);

  try {
    const raw = await AsyncStorage.getItem(GUEST_SESSION_KEY);
    if (!raw) {
      activeGuestSession = null;
      return null;
    }

    const parsed = JSON.parse(raw) as AuthUser;
    if (typeof parsed.uid === 'string') {
      activeGuestSession = {
        ...parsed,
        id: parsed.uid,
      };
      return activeGuestSession;
    }
  } catch {
    activeGuestSession = null;
  }

  return null;
}

export async function mockSignInAsGuest(): Promise<AuthUser> {
  await wait(500);

  if (activeGuestSession?.isAnonymous) {
    return activeGuestSession;
  }

  const guestUser = createAuthUser({
    uid: `guest-${Date.now()}`,
    isAnonymous: true,
    displayName: 'Guest',
    role: 'guest',
  });

  await persistGuestSession(guestUser);
  return guestUser;
}

export async function mockSignIn(payload: SignInPayload): Promise<AuthUser> {
  await wait(900);

  const normalizedEmail = normalizeEmail(payload.email);
  const match = mockUsers.find(
    (user) => user.email && normalizeEmail(user.email) === normalizedEmail,
  );

  if (!match || match.password !== payload.password) {
    throw new AuthError('The email or password is incorrect.', 'invalid-credentials');
  }

  const user = createAuthUser({
    uid: match.uid,
    isAnonymous: false,
    displayName: match.name,
    email: match.email,
    role: match.role,
  });

  await persistGuestSession(null);
  return user;
}

export async function mockSignUp(payload: SignUpPayload): Promise<AuthUser> {
  await wait(900);

  if (!isValidEmail(payload.email)) {
    throw new AuthError('Please enter a valid email address.', 'invalid-email');
  }

  if (payload.password.length < 8) {
    throw new AuthError('Password must be at least 8 characters long.', 'weak-password');
  }

  if (payload.password !== payload.confirmPassword) {
    throw new AuthError('Passwords do not match.', 'password-mismatch');
  }

  const exists = mockUsers.some(
    (user) => user.email && normalizeEmail(user.email) === normalizeEmail(payload.email),
  );
  if (exists) {
    throw new AuthError('This email is already registered.', 'email-in-use');
  }

  const upgradingGuest = activeGuestSession?.isAnonymous === true;
  const uid = upgradingGuest && activeGuestSession ? activeGuestSession.uid : `user-${Date.now()}`;

  const newUser = createAuthUser({
    uid,
    isAnonymous: false,
    displayName: payload.fullName.trim(),
    email: payload.email.trim(),
  });

  mockUsers.push({
    ...newUser,
    password: payload.password,
  } as MockCredentialUser);

  await persistGuestSession(null);
  return newUser;
}

export async function mockForgotPassword(_payload: ForgotPasswordPayload): Promise<void> {
  await wait(700);
  // Always succeed in mock mode to avoid email enumeration.
}

export async function mockSignOut(): Promise<void> {
  await wait(400);
  await persistGuestSession(null);
}

export function getMockActiveGuestSession(): AuthUser | null {
  return activeGuestSession;
}

import {
  AuthError,
  type AuthUser,
  type ForgotPasswordPayload,
  type SignInPayload,
  type SignUpPayload,
} from '@/features/auth/types';

const mockUsers: Array<AuthUser & { password: string }> = [
  {
    id: 'demo-player',
    name: 'Alex Rivera',
    email: 'player@scoutx.app',
    password: 'Password123!',
    role: 'player',
  },
  {
    id: 'demo-scout',
    name: 'Mina Chen',
    email: 'scout@scoutx.app',
    password: 'Password123!',
    role: 'scout',
  },
];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /.+@.+\..+/.test(email);
}

export async function mockInitializeSession(): Promise<AuthUser | null> {
  await wait(900);
  return null;
}

export async function mockSignIn(payload: SignInPayload): Promise<AuthUser> {
  await wait(900);

  const normalizedEmail = normalizeEmail(payload.email);
  const match = mockUsers.find(
    (user) => normalizeEmail(user.email) === normalizedEmail && user.password === payload.password,
  );

  if (!match) {
    throw new AuthError('The email or password is incorrect.', 'invalid-credentials');
  }

  return {
    id: match.id,
    name: match.name,
    email: match.email,
    role: match.role,
  };
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

  const exists = mockUsers.some((user) => normalizeEmail(user.email) === normalizeEmail(payload.email));
  if (exists) {
    throw new AuthError('This email is already registered.', 'email-in-use');
  }

  const newUser: AuthUser & { password: string } = {
    id: `user-${Date.now()}`,
    name: payload.fullName.trim(),
    email: payload.email.trim(),
    password: payload.password,
  };

  mockUsers.push(newUser);

  return {
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
  };
}

export async function mockForgotPassword(payload: ForgotPasswordPayload): Promise<void> {
  await wait(700);

  const normalizedEmail = normalizeEmail(payload.email);
  const match = mockUsers.find((user) => normalizeEmail(user.email) === normalizedEmail);

  if (!match) {
    throw new AuthError('We could not find an account for this email.', 'not-found');
  }
}

export async function mockSignOut(): Promise<void> {
  await wait(400);
}

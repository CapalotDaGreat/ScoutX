export type AuthRole = 'guest' | 'player' | 'scout' | 'coach' | 'club';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export type AccountUpgradeIntent = 'register' | 'login';

export type AuthUser = {
  /** Firebase UID — canonical identifier */
  uid: string;
  /** @deprecated Use `uid` — kept for backward compatibility with existing hooks */
  id: string;
  isAnonymous: boolean;
  displayName?: string;
  /** Display name alias used across the app */
  name: string;
  email?: string;
  role?: AuthRole;
};

export type SignInPayload = {
  email: string;
  password: string;
};

export type SignUpPayload = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type ForgotPasswordPayload = {
  email: string;
};

export function createAuthUser(fields: {
  uid: string;
  isAnonymous?: boolean;
  displayName?: string;
  name?: string;
  email?: string;
  role?: AuthRole;
}): AuthUser {
  const displayName = fields.displayName ?? fields.name ?? 'PitchProof User';
  return {
    uid: fields.uid,
    id: fields.uid,
    isAnonymous: fields.isAnonymous ?? false,
    displayName,
    name: displayName,
    email: fields.email,
    role: fields.role,
  };
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'invalid-credentials'
      | 'email-in-use'
      | 'weak-password'
      | 'password-mismatch'
      | 'invalid-email'
      | 'not-found'
      | 'anonymous-disabled'
      | 'credential-already-in-use'
      | 'requires-recent-login'
      | 'account-exists-with-different-credential',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

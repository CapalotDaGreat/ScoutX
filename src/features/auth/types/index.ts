export type AuthRole = 'player' | 'scout';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
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

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'invalid-credentials'
      | 'email-in-use'
      | 'weak-password'
      | 'password-mismatch'
      | 'invalid-email'
      | 'not-found',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

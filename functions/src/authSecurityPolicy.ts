/**
 * Cloud Functions must never accept, log, persist, or return plaintext passwords.
 * Credential operations belong exclusively to Firebase Authentication on the client.
 *
 * See ../../SECURITY.md for the full ScoutX authentication security policy.
 */
export const AUTH_SECURITY_POLICY = {
  passwordsHandledBy: 'firebase-authentication-only',
  forbiddenRequestFields: ['password', 'passwordHash', 'passwordSalt', 'credentials', 'secret'],
} as const;

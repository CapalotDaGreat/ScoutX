export const REAUTH_METHODS = ['password', 'apple.com', 'google.com'] as const;
export type ReauthMethod = (typeof REAUTH_METHODS)[number];

export type ReauthFailure = 'wrong_password' | 'wrong_account' | 'cancelled' | 'too_many_attempts' | 'failed';
export type AccountDeletionFailure = 'recent_login_required' | 'failed';

export class ReauthError extends Error {
  readonly kind: ReauthFailure;

  constructor(kind: ReauthFailure) {
    super(`Re-authentication failed: ${kind}`);
    this.kind = kind;
    this.name = 'ReauthError';
  }
}

function codeOf(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
}

function reasonOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('details' in error)) return null;
  const details = (error as { details: unknown }).details;
  const reason = details && typeof details === 'object' ? (details as { reason?: unknown }).reason : undefined;
  return typeof reason === 'string' ? reason : null;
}

function isReauthMethod(value: string): value is ReauthMethod {
  return (REAUTH_METHODS as readonly string[]).includes(value);
}

/** Sign-in methods linked to the account that can prove identity again, in the account's own order. */
export function reauthMethodsFor(providerIds: readonly string[]): ReauthMethod[] {
  return [...new Set(providerIds.filter(isReauthMethod))];
}

export function classifyReauthError(error: unknown): ReauthFailure {
  if (error instanceof ReauthError) return error.kind;
  const code = codeOf(error);
  if (code.includes('wrong-password') || code.includes('invalid-credential') || code.includes('invalid-login-credentials')) {
    return 'wrong_password';
  }
  if (code.includes('user-mismatch')) return 'wrong_account';
  if (code.includes('too-many-requests')) return 'too_many_attempts';
  if (code.includes('cancel') || code === 'ERR_REQUEST_CANCELED') return 'cancelled';
  return 'failed';
}

/** The server marks stale sessions with `details.reason`; Firebase Auth uses `requires-recent-login`. */
export function classifyDeletionError(error: unknown): AccountDeletionFailure {
  if (reasonOf(error) === 'recent_login_required') return 'recent_login_required';
  if (codeOf(error).includes('requires-recent-login')) return 'recent_login_required';
  return 'failed';
}

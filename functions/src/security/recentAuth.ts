/**
 * Server-side freshness checks for destructive actions. The client also re-authenticates, but
 * only the ID token's `auth_time` (set by Firebase when the user last proved a credential) is
 * trusted here.
 */

/** Account deletion needs a sign-in within the last 5 minutes (Firebase's own recent-login window). */
export const DELETION_RECENT_AUTH_SEC = 5 * 60;
/** A deletion that already started with a fresh sign-in may be resumed for this long. */
export const DELETION_RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Tolerated clock skew between Firebase Auth and the function host. */
const CLOCK_SKEW_SEC = 60;

export const RECENT_LOGIN_REQUIRED = 'recent_login_required';
export const RECENT_LOGIN_MESSAGE = 'For your security, please sign in again before deleting your account.';

export type DeletionAuthInput = {
  /** `auth_time` claim in seconds. */
  authTime: unknown;
  /** `firebase.sign_in_provider` claim. */
  signInProvider: unknown;
  /** `requestedAt` of an unfinished `deletionRequests/{uid}` document, if any. */
  pendingRequestedAt: unknown;
  nowMs: number;
};

export type DeletionAuthDecision =
  | { allowed: true; basis: 'anonymous' | 'recent_sign_in' | 'resume' }
  | { allowed: false; reason: typeof RECENT_LOGIN_REQUIRED };

export function isRecentSignIn(authTime: unknown, nowMs: number, windowSec: number): boolean {
  const seconds = typeof authTime === 'number' ? authTime : Number(authTime);
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  const age = nowMs / 1000 - seconds;
  return age >= -CLOCK_SKEW_SEC && age <= windowSec;
}

/**
 * Anonymous (guest) accounts cannot re-authenticate and hold no credentials or personal
 * profile, so the session itself is enough. Everyone else needs a recent sign-in, unless they
 * are resuming a deletion that was authorized less than a day ago.
 */
export function decideDeletionAuth(input: DeletionAuthInput): DeletionAuthDecision {
  if (input.signInProvider === 'anonymous') return { allowed: true, basis: 'anonymous' };
  if (isRecentSignIn(input.authTime, input.nowMs, DELETION_RECENT_AUTH_SEC)) {
    return { allowed: true, basis: 'recent_sign_in' };
  }
  if (typeof input.pendingRequestedAt === 'string') {
    const startedMs = Date.parse(input.pendingRequestedAt);
    if (Number.isFinite(startedMs) && input.nowMs - startedMs <= DELETION_RESUME_WINDOW_MS && startedMs <= input.nowMs) {
      return { allowed: true, basis: 'resume' };
    }
  }
  return { allowed: false, reason: RECENT_LOGIN_REQUIRED };
}

import type { AuthStatus } from '@/features/auth/types';

/**
 * Whether the "Preparing your PitchProof session" curtain must cover the app.
 *
 * It stays up while the Auth listener has not answered, and also for the render in which the
 * listener has returned a restored user that the auth state has not applied yet. Without the
 * second case a cold link exposed its screen for one commit (about 40-80 ms in the web build) and
 * the age/guardian gate's loading curtain then covered it, so a tap on Back that landed in that
 * window hit the curtain and did nothing (blocker register B-20).
 *
 * A visitor whose anonymous session is still being created has no user yet and is not covered,
 * as before.
 */
export function isRestoringSession(status: AuthStatus, listenerLoading: boolean, hasListenerUser: boolean): boolean {
  return status === 'loading' && (listenerLoading || hasListenerUser);
}

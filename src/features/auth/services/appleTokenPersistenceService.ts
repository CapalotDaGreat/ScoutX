import { createCallableFunction } from '@/firebase/callableFunctions';

export type PersistAppleAuthorizationCodeResult =
  | { stored: true }
  | { stored: false; reason: 'secrets-missing' | 'functions-unavailable' };

/**
 * Best-effort persistence of Apple authorization codes for App Store token revocation.
 * Failures are swallowed — Sign in with Apple must not break if Functions/secrets are absent in local builds.
 */
export async function persistAppleAuthorizationCode(input: {
  authorizationCode: string;
  appleUserId?: string;
}): Promise<PersistAppleAuthorizationCodeResult> {
  const callable = createCallableFunction<{
    authorizationCode: string;
    appleUserId?: string;
  }>('persistAppleAuthorizationCode');

  if (!callable) {
    return { stored: false, reason: 'functions-unavailable' };
  }

  try {
    const response = await callable({
      authorizationCode: input.authorizationCode,
      appleUserId: input.appleUserId,
    });
    const data = response.data as PersistAppleAuthorizationCodeResult | undefined;
    if (data && typeof data === 'object' && 'stored' in data) {
      return data;
    }
    return { stored: true };
  } catch {
    return { stored: false, reason: 'functions-unavailable' };
  }
}

export async function deleteAuthenticatedAccountViaCloud(): Promise<boolean> {
  const callable = createCallableFunction<Record<string, never>>('deleteAuthenticatedAccount');
  if (!callable) {
    return false;
  }

  // No local fallback once a backend exists: server-only records (guardian contacts, consent
  // proof, mail, quarantine) are unreachable from the client, so deleting the sign-in locally
  // would leave data behind with no way to resume. Errors surface so the user can retry.
  await callable({});
  return true;
}

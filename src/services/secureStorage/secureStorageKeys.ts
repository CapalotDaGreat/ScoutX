import { SecureStorageError } from '@/services/secureStorage/types';

/**
 * Allowlisted keys for encrypted device storage.
 *
 * Firebase Auth owns session persistence (ID tokens / refresh tokens).
 * PitchProof must never duplicate Firebase credentials here.
 * Add keys only for application secrets that require encrypted device storage.
 */
export const SECURE_STORAGE_KEYS = {
  /** Short-lived OAuth CSRF state + nonce (Apple / future redirect OAuth). */
  OAUTH_PENDING_STATE: 'auth.oauth.pending-state',
} as const;

export type SecureStorageKey =
  (typeof SECURE_STORAGE_KEYS)[keyof typeof SECURE_STORAGE_KEYS];

const ALLOWED_KEYS = new Set<string>(Object.values(SECURE_STORAGE_KEYS));

/** Reject accidental registration of credential-shaped key names. */
const FORBIDDEN_KEY_FRAGMENTS = [
  'password',
  'firebase',
  'id-token',
  'idtoken',
  'refresh-token',
  'refresh_token',
  'refreshtoken',
  'access-token',
  'accesstoken',
  'credential',
  'secret-key',
  'apikey',
  'api-key',
] as const;

export function toSecureStoreKey(key: SecureStorageKey): string {
  return `scoutx.${key}`;
}

export function listAllowlistedSecureStorageKeys(): SecureStorageKey[] {
  return Object.values(SECURE_STORAGE_KEYS);
}

export function assertAllowedSecureStorageKey(key: string): asserts key is SecureStorageKey {
  if (!ALLOWED_KEYS.has(key)) {
    throw new SecureStorageError(
      `Storage key "${key}" is not allowlisted for SecureStorageService.`,
      'invalid-key',
    );
  }

  const normalized = key.toLowerCase();
  for (const fragment of FORBIDDEN_KEY_FRAGMENTS) {
    if (normalized.includes(fragment)) {
      throw new SecureStorageError(
        `Storage key "${key}" is not permitted for SecureStorageService.`,
        'invalid-key',
      );
    }
  }
}

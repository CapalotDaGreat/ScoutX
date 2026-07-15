import { FORBIDDEN_CREDENTIAL_FIELDS } from '@/config/authSecurity';
import { SecureStorageError } from '@/services/secureStorage/types';

/** Soft size policy — keep values small; SecureStore is not a general database. */
export const SECURE_STORAGE_MAX_VALUE_BYTES = 2048;

/**
 * Extra substrings that must never appear in SecureStorage payloads.
 * Blocks accidental persistence of Firebase / OAuth credential material.
 */
const FORBIDDEN_VALUE_FRAGMENTS = [
  ...FORBIDDEN_CREDENTIAL_FIELDS.map((field) => field.toLowerCase()),
  'idtoken',
  'id_token',
  'refresh_token',
  'refreshtoken',
  'access_token',
  'accesstoken',
  'authorizationcode',
  'authorization_code',
  'firebase',
  'bearertoken',
] as const;

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function assertAllowedSecureStorageValue(value: string): void {
  if (value.length === 0) {
    throw new SecureStorageError('Secure storage values cannot be empty.', 'forbidden-value');
  }

  const byteLength = utf8ByteLength(value);
  if (byteLength > SECURE_STORAGE_MAX_VALUE_BYTES) {
    throw new SecureStorageError(
      `Secure storage values must be ${SECURE_STORAGE_MAX_VALUE_BYTES} bytes or smaller.`,
      'forbidden-value',
    );
  }

  const normalized = value.toLowerCase();

  for (const field of FORBIDDEN_CREDENTIAL_FIELDS) {
    const lower = field.toLowerCase();
    if (
      normalized.includes(`"${lower}"`) ||
      normalized.includes(`'${lower}'`) ||
      normalized.includes(`${lower}:`) ||
      normalized.includes(`${lower}=`)
    ) {
      throw new SecureStorageError(
        'Credential-like payloads cannot be stored in SecureStorageService.',
        'forbidden-value',
      );
    }
  }

  for (const fragment of FORBIDDEN_VALUE_FRAGMENTS) {
    if (
      normalized.includes(`"${fragment}"`) ||
      normalized.includes(`'${fragment}'`) ||
      normalized.includes(`${fragment}:`) ||
      normalized.includes(`${fragment}=`)
    ) {
      throw new SecureStorageError(
        'Credential-like payloads cannot be stored in SecureStorageService.',
        'forbidden-value',
      );
    }
  }
}

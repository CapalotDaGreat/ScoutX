import { getRandomBytes } from 'expo-crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomBytes(length: number): Uint8Array {
  return getRandomBytes(length);
}

/** Cryptographically strong base36 string (not Math.random). */
export function secureRandomBase36(length: number): string {
  const size = Math.min(64, Math.max(1, Math.floor(length)));
  const bytes = randomBytes(size);
  let body = '';
  for (let i = 0; i < size; i += 1) {
    body += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return body;
}

/**
 * Cryptographically strong identifier for client-generated document / job ids.
 * Prefer server-assigned ids when the backend creates the record; use this when
 * the client must name an object before the first write (for example local drafts).
 */
export function createSecureId(prefix: string, randomLength = 10, separator: '_' | '-' = '_'): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'id';
  return `${safePrefix}${separator}${Date.now().toString(36)}${separator}${secureRandomBase36(randomLength)}`;
}

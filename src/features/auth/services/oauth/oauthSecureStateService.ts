import * as Crypto from 'expo-crypto';
import {
  SECURE_STORAGE_KEYS,
  secureStorageService,
} from '@/services/secureStorage';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

type StoredOAuthState = {
  state: string;
  nonce: string;
  createdAt: number;
};

function isExpired(createdAt: number): boolean {
  return Date.now() - createdAt > OAUTH_STATE_TTL_MS;
}

function isStoredOAuthState(value: unknown): value is StoredOAuthState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StoredOAuthState>;
  return (
    typeof candidate.state === 'string' &&
    typeof candidate.nonce === 'string' &&
    typeof candidate.createdAt === 'number'
  );
}

/**
 * Persists short-lived OAuth CSRF state + raw nonce in SecureStorage when available.
 * Returns values for in-memory use on native Sign in with Apple (identityToken path).
 */
export async function createOAuthPendingState(): Promise<{
  state: string;
  rawNonce: string;
  hashedNonce: string;
}> {
  const state = Crypto.randomUUID();
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  const payload: StoredOAuthState = {
    state,
    nonce: rawNonce,
    createdAt: Date.now(),
  };

  if (await secureStorageService.isAvailable()) {
    try {
      await secureStorageService.setItem(
        SECURE_STORAGE_KEYS.OAUTH_PENDING_STATE,
        JSON.stringify(payload),
      );
    } catch {
      // Continue with in-memory nonce if SecureStore write fails transiently.
    }
  }

  return { state, rawNonce, hashedNonce };
}

export async function readOAuthPendingState(): Promise<StoredOAuthState | null> {
  if (!(await secureStorageService.isAvailable())) {
    return null;
  }

  let serialized: string | null;
  try {
    serialized = await secureStorageService.getItem(SECURE_STORAGE_KEYS.OAUTH_PENDING_STATE);
  } catch {
    return null;
  }

  if (!serialized) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isStoredOAuthState(parsed) || isExpired(parsed.createdAt)) {
      await clearOAuthPendingState();
      return null;
    }

    return parsed;
  } catch {
    await clearOAuthPendingState();
    return null;
  }
}

export async function clearOAuthPendingState(): Promise<void> {
  try {
    await secureStorageService.removeItem(SECURE_STORAGE_KEYS.OAUTH_PENDING_STATE);
  } catch {
    // Best-effort cleanup.
  }
}

/**
 * Reads and clears pending OAuth state for redirect-style providers that echo `state`.
 * Returns the raw nonce when state matches and TTL is valid.
 */
export async function consumeOAuthPendingNonce(expectedState: string): Promise<string | null> {
  const pending = await readOAuthPendingState();
  if (!pending || pending.state !== expectedState) {
    return null;
  }

  await clearOAuthPendingState();
  return pending.nonce;
}

/**
 * Validates that a pending SecureStore entry still matches the in-memory nonce/state
 * (native Apple sync flow), then clears it. Falls back to the in-memory nonce.
 */
export async function resolveOAuthRawNonce(input: {
  state: string;
  fallbackRawNonce: string;
}): Promise<string> {
  const pending = await readOAuthPendingState();
  if (pending && pending.state === input.state && pending.nonce.length > 0) {
    await clearOAuthPendingState();
    return pending.nonce;
  }

  await clearOAuthPendingState();
  return input.fallbackRawNonce;
}

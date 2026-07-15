import { secureStorageBackend } from '@/services/secureStorage/secureStorageBackend';
import {
  assertAllowedSecureStorageKey,
  listAllowlistedSecureStorageKeys,
  toSecureStoreKey,
  type SecureStorageKey,
} from '@/services/secureStorage/secureStorageKeys';
import { assertAllowedSecureStorageValue } from '@/services/secureStorage/secureStorageValidation';
import {
  SecureStorageError,
  type SecureStoragePlatform,
} from '@/services/secureStorage/types';

/**
 * SecureStorageService — Expo SDK 54 secure persistence facade.
 *
 * Selects the highest-security backend available:
 * - iOS / Android → `expo-secure-store` (Keychain / Keystore), device-only, unlocked
 * - Web → AES-GCM (Web Crypto) with non-extractable IndexedDB key (best-effort; not hardware Keychain)
 *
 * Session authority remains Firebase Authentication persistence.
 * Never store Firebase ID tokens, refresh tokens, or passwords here.
 */
export class SecureStorageService {
  getPlatform(): SecureStoragePlatform {
    return secureStorageBackend.platform;
  }

  /**
   * Native Keychain/Keystore is stronger than the web AES-GCM fallback.
   * Callers that require hardware-backed secrets should check this.
   */
  isHardwareBacked(): boolean {
    const platform = this.getPlatform();
    return platform === 'ios' || platform === 'android';
  }

  async isAvailable(): Promise<boolean> {
    return secureStorageBackend.isAvailable();
  }

  async getItem(key: SecureStorageKey): Promise<string | null> {
    assertAllowedSecureStorageKey(key);

    if (!(await this.isAvailable())) {
      throw new SecureStorageError(
        'Secure storage is unavailable on this device.',
        'unavailable',
      );
    }

    try {
      return await secureStorageBackend.getItem(toSecureStoreKey(key));
    } catch (error) {
      if (error instanceof SecureStorageError) {
        throw error;
      }
      throw new SecureStorageError('Failed to read secure storage value.', 'read-failed', error);
    }
  }

  async setItem(key: SecureStorageKey, value: string): Promise<void> {
    assertAllowedSecureStorageKey(key);
    assertAllowedSecureStorageValue(value);

    if (!(await this.isAvailable())) {
      throw new SecureStorageError(
        'Secure storage is unavailable on this device.',
        'unavailable',
      );
    }

    try {
      await secureStorageBackend.setItem(toSecureStoreKey(key), value);
    } catch (error) {
      if (error instanceof SecureStorageError) {
        throw error;
      }
      throw new SecureStorageError('Failed to write secure storage value.', 'write-failed', error);
    }
  }

  async removeItem(key: SecureStorageKey): Promise<void> {
    assertAllowedSecureStorageKey(key);

    if (!(await this.isAvailable())) {
      return;
    }

    try {
      await secureStorageBackend.removeItem(toSecureStoreKey(key));
    } catch (error) {
      if (error instanceof SecureStorageError) {
        throw error;
      }
      throw new SecureStorageError('Failed to delete secure storage value.', 'write-failed', error);
    }
  }

  /**
   * Best-effort wipe of all allowlisted application secrets (e.g. on sign-out).
   * Does not touch Firebase Auth session storage.
   */
  async clearAllowlistedItems(): Promise<void> {
    if (!(await this.isAvailable())) {
      return;
    }

    await Promise.all(
      listAllowlistedSecureStorageKeys().map(async (key) => {
        try {
          await this.removeItem(key);
        } catch {
          // Continue clearing remaining keys.
        }
      }),
    );
  }
}

export const secureStorageService = new SecureStorageService();

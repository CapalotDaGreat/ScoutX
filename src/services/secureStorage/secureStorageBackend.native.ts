import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { SecureStorageBackend } from '@/services/secureStorage/types';

/**
 * Expo SecureStore (SDK 54) options.
 *
 * - WHEN_UNLOCKED_THIS_DEVICE_ONLY: highest practical Keychain protection without biometrics mid-flow.
 * - requireAuthentication is intentionally OFF for short-lived OAuth CSRF secrets —
 *   Face ID mid Sign-In with Apple would break the native OAuth UX.
 * - Sync getItem/setItem APIs are avoided (they block the JS thread).
 */
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const NATIVE_PLATFORM: SecureStorageBackend['platform'] =
  Platform.OS === 'ios' ? 'ios' : 'android';

export const secureStorageBackend: SecureStorageBackend = {
  platform: NATIVE_PLATFORM,

  async isAvailable(): Promise<boolean> {
    try {
      return await SecureStore.isAvailableAsync();
    } catch {
      return false;
    }
  },

  async getItem(storageKey: string): Promise<string | null> {
    return SecureStore.getItemAsync(storageKey, SECURE_STORE_OPTIONS);
  },

  async setItem(storageKey: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(storageKey, value, SECURE_STORE_OPTIONS);
  },

  async removeItem(storageKey: string): Promise<void> {
    await SecureStore.deleteItemAsync(storageKey, SECURE_STORE_OPTIONS);
  },
};

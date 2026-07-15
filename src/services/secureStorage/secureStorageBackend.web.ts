/**
 * Web SecureStorage backend — best-effort AES-GCM encryption for browsers.
 *
 * Not equivalent to iOS Keychain / Android Keystore. Prefer Firebase Auth session
 * persistence for credentials. Only store allowlisted short-lived app secrets here.
 *
 * Architecture:
 * - Non-extractable AES-GCM-256 CryptoKey in IndexedDB
 * - Ciphertext + IV in localStorage under scoutx.secure.*
 */
import type { SecureStorageBackend } from '@/services/secureStorage/types';

const WEB_STORAGE_PREFIX = 'scoutx.secure.';
const INDEXED_DB_NAME = 'scoutx-secure-storage';
const INDEXED_DB_VERSION = 1;
const INDEXED_DB_STORE = 'crypto-keys';
const INDEXED_DB_KEY_ID = 'aes-gcm-master';

type EncryptedPayload = {
  iv: string;
  ciphertext: string;
};

function getWebCrypto(): Crypto {
  if (typeof globalThis.crypto?.subtle === 'undefined') {
    throw new Error('Web Crypto API is unavailable in this environment.');
  }

  return globalThis.crypto;
}

function getLocalStorage(): Storage | null {
  if (typeof globalThis.localStorage === 'undefined') {
    return null;
  }

  return globalThis.localStorage;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return globalThis.btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open secure storage database.'));
    };

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(INDEXED_DB_STORE)) {
        database.createObjectStore(INDEXED_DB_STORE);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

async function readIndexedDbValue(key: string): Promise<CryptoKey | null> {
  const database = await openIndexedDb();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(INDEXED_DB_STORE, 'readonly');
    const store = transaction.objectStore(INDEXED_DB_STORE);
    const request = store.get(key);

    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error('Failed to read secure storage key.'));
    };

    request.onsuccess = () => {
      database.close();
      resolve((request.result as CryptoKey | undefined) ?? null);
    };
  });
}

async function writeIndexedDbValue(key: string, value: CryptoKey): Promise<void> {
  const database = await openIndexedDb();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(INDEXED_DB_STORE, 'readwrite');
    const store = transaction.objectStore(INDEXED_DB_STORE);
    const request = store.put(value, key);

    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error('Failed to persist secure storage key.'));
    };

    request.onsuccess = () => {
      database.close();
      resolve();
    };
  });
}

async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  const existing = await readIndexedDbValue(INDEXED_DB_KEY_ID);
  if (existing) {
    return existing;
  }

  const cryptoApi = getWebCrypto();
  const generated = await cryptoApi.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  await writeIndexedDbValue(INDEXED_DB_KEY_ID, generated);
  return generated;
}

async function encryptValue(value: string): Promise<string> {
  const cryptoApi = getWebCrypto();
  const key = await getOrCreateEncryptionKey();
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const encrypted = await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  const payload: EncryptedPayload = {
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted)),
  };

  return JSON.stringify(payload);
}

async function decryptValue(serialized: string): Promise<string | null> {
  try {
    const payload = JSON.parse(serialized) as EncryptedPayload;
    if (!payload.iv || !payload.ciphertext) {
      return null;
    }

    const cryptoApi = getWebCrypto();
    const key = await getOrCreateEncryptionKey();
    const decrypted = await cryptoApi.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(payload.iv) },
      key,
      fromBase64(payload.ciphertext),
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export const secureStorageBackend: SecureStorageBackend = {
  platform: 'web',

  async isAvailable(): Promise<boolean> {
    return getLocalStorage() !== null && typeof globalThis.indexedDB !== 'undefined';
  },

  async getItem(storageKey: string): Promise<string | null> {
    const storage = getLocalStorage();
    if (!storage) {
      return null;
    }

    const encrypted = storage.getItem(`${WEB_STORAGE_PREFIX}${storageKey}`);
    if (!encrypted) {
      return null;
    }

    return decryptValue(encrypted);
  },

  async setItem(storageKey: string, value: string): Promise<void> {
    const storage = getLocalStorage();
    if (!storage) {
      throw new Error('localStorage is unavailable in this browser.');
    }

    const encrypted = await encryptValue(value);
    storage.setItem(`${WEB_STORAGE_PREFIX}${storageKey}`, encrypted);
  },

  async removeItem(storageKey: string): Promise<void> {
    const storage = getLocalStorage();
    if (!storage) {
      return;
    }

    storage.removeItem(`${WEB_STORAGE_PREFIX}${storageKey}`);
  },
};

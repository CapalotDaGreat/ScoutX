export type SecureStoragePlatform = 'ios' | 'android' | 'web';

export type SecureStorageBackend = {
  readonly platform: SecureStoragePlatform;
  isAvailable(): Promise<boolean>;
  getItem(storageKey: string): Promise<string | null>;
  setItem(storageKey: string, value: string): Promise<void>;
  removeItem(storageKey: string): Promise<void>;
};

export type SecureStorageErrorCode =
  | 'unavailable'
  | 'invalid-key'
  | 'forbidden-value'
  | 'read-failed'
  | 'write-failed';

export class SecureStorageError extends Error {
  readonly code: SecureStorageErrorCode;
  readonly cause?: unknown;

  constructor(message: string, code: SecureStorageErrorCode, cause?: unknown) {
    super(message);
    this.name = 'SecureStorageError';
    this.code = code;
    this.cause = cause;
  }
}

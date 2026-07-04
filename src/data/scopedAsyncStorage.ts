import AsyncStorage from '@react-native-async-storage/async-storage';

type ScopedStore = Record<string, unknown>;

export async function loadScopedValue<T>(
  storageKey: string,
  scopeId: string,
  normalize: (value: unknown) => T | null,
  fallback: () => T,
): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) {
      return fallback();
    }

    const parsed = JSON.parse(raw) as unknown;
    const record = asScopedStore(parsed);
    if (!record) {
      return fallback();
    }

    const normalized = normalize(record[scopeId]);
    return normalized ?? fallback();
  } catch {
    return fallback();
  }
}

export async function saveScopedValue<T>(
  storageKey: string,
  scopeId: string,
  value: T,
): Promise<void> {
  const raw = await AsyncStorage.getItem(storageKey);
  const record = raw ? asScopedStore(JSON.parse(raw)) ?? {} : {};
  record[scopeId] = value;
  await AsyncStorage.setItem(storageKey, JSON.stringify(record));
}

function asScopedStore(value: unknown): ScopedStore | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as ScopedStore)
    : null;
}

/**
 * Migrates a legacy single-value blob into the scoped store under `scopeId`.
 */
export async function migrateLegacyScopedValue<T>(
  storageKey: string,
  scopeId: string,
  isLegacyValue: (value: unknown) => value is T,
  normalize: (value: unknown) => T | null,
): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (isLegacyValue(parsed)) {
      const normalized = normalize(parsed);
      if (normalized) {
        await saveScopedValue(storageKey, scopeId, normalized);
      }
      return normalized;
    }

    return null;
  } catch {
    return null;
  }
}

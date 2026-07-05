import AsyncStorage from '@react-native-async-storage/async-storage';

type ScopedStore = Record<string, unknown>;

export async function readKeyedRecord<T>(storageKey: string): Promise<Record<string, T>> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as Record<string, T>;
  } catch {
    return {};
  }
}

export async function writeKeyedRecord<T>(
  storageKey: string,
  updater: (current: Record<string, T>) => Record<string, T>,
): Promise<void> {
  const current = await readKeyedRecord<T>(storageKey);
  await AsyncStorage.setItem(storageKey, JSON.stringify(updater(current)));
}

export async function readKeyedValue<T>(storageKey: string, key: string): Promise<T | null> {
  const record = await readKeyedRecord<T>(storageKey);
  return record[key] ?? null;
}

export async function writeKeyedValue<T>(
  storageKey: string,
  key: string,
  value: T,
): Promise<void> {
  await writeKeyedRecord<T>(storageKey, (current) => ({
    ...current,
    [key]: value,
  }));
}

export async function deleteKeyedValue(storageKey: string, key: string): Promise<void> {
  await writeKeyedRecord<unknown>(storageKey, (current) => {
    const next = { ...current };
    delete next[key];
    return next as Record<string, unknown>;
  });
}

export async function upsertKeyedListItem<T extends { id: string }>(
  storageKey: string,
  listKey: string,
  item: T,
  sortItems: (items: T[]) => T[],
): Promise<void> {
  await writeKeyedRecord<T[]>(storageKey, (current) => {
    const existing = current[listKey] ?? [];
    return {
      ...current,
      [listKey]: sortItems([item, ...existing.filter((entry) => entry.id !== item.id)]),
    };
  });
}

export async function removeKeyedListItem<T extends { id: string }>(
  storageKey: string,
  listKey: string,
  itemId: string,
): Promise<void> {
  await writeKeyedRecord<T[]>(storageKey, (current) => ({
    ...current,
    [listKey]: (current[listKey] ?? []).filter((entry) => entry.id !== itemId),
  }));
}

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

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = '@scoutx/drafts/';
const DRAFT_VERSION = 1;

export type StoredDraft<T> = {
  data: T;
  savedAt: string;
};

type DraftEnvelope = {
  version: number;
  savedAt: string;
  data: unknown;
};

function isEnvelope(value: unknown): value is DraftEnvelope {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.version === DRAFT_VERSION &&
    typeof record.savedAt === 'string' &&
    !Number.isNaN(Date.parse(record.savedAt)) &&
    'data' in record
  );
}

/** Parses a raw stored draft; returns null for anything corrupted, outdated or invalid. */
export function parseStoredDraft<T>(
  raw: string | null,
  parse: (value: unknown) => T | null,
): StoredDraft<T> | null {
  if (!raw) {
    return null;
  }
  try {
    const envelope: unknown = JSON.parse(raw);
    if (!isEnvelope(envelope)) {
      return null;
    }
    const data = parse(envelope.data);
    return data === null ? null : { data, savedAt: envelope.savedAt };
  } catch {
    return null;
  }
}

export function serializeDraft<T>(data: T, savedAt: Date = new Date()): string {
  const envelope: DraftEnvelope = { version: DRAFT_VERSION, savedAt: savedAt.toISOString(), data };
  return JSON.stringify(envelope);
}

/**
 * Local-only persistence for unfinished workflows. Drafts never sync to the server, so they
 * cannot overwrite completed server data; corrupted drafts are deleted instead of crashing.
 */
export function createDraftStore<T>(name: string, parse: (value: unknown) => T | null) {
  const keyFor = (userId: string) => `${STORAGE_PREFIX}${name}/${userId}`;

  return {
    async load(userId: string): Promise<StoredDraft<T> | null> {
      const key = keyFor(userId);
      const raw = await AsyncStorage.getItem(key);
      const draft = parseStoredDraft(raw, parse);
      if (raw && !draft) {
        await AsyncStorage.removeItem(key);
      }
      return draft;
    },
    async save(userId: string, data: T): Promise<string> {
      const savedAt = new Date();
      await AsyncStorage.setItem(keyFor(userId), serializeDraft(data, savedAt));
      return savedAt.toISOString();
    },
    async clear(userId: string): Promise<void> {
      await AsyncStorage.removeItem(keyFor(userId));
    },
  };
}

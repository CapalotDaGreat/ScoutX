import AsyncStorage from '@react-native-async-storage/async-storage';

const USAGE_STORAGE_KEY = '@scoutx/anonymous-usage';
const ACCOUNT_UPGRADE_SESSION_THRESHOLD = 3;
const UPGRADE_PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

type AnonymousUsageRecord = {
  sessionCount: number;
  snoozedUntil: string | null;
};

type AnonymousUsageStore = Record<string, AnonymousUsageRecord>;

async function readStore(): Promise<AnonymousUsageStore> {
  try {
    const raw = await AsyncStorage.getItem(USAGE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as AnonymousUsageStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStore(store: AnonymousUsageStore): Promise<void> {
  await AsyncStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(store));
}

function createDefaultRecord(): AnonymousUsageRecord {
  return {
    sessionCount: 0,
    snoozedUntil: null,
  };
}

export function getAccountUpgradeSessionThreshold(): number {
  return ACCOUNT_UPGRADE_SESSION_THRESHOLD;
}

export async function recordAnonymousSession(uid: string): Promise<number> {
  const store = await readStore();
  const current = store[uid] ?? createDefaultRecord();
  const nextCount = current.sessionCount + 1;

  store[uid] = {
    ...current,
    sessionCount: nextCount,
  };

  await writeStore(store);
  return nextCount;
}

export async function getAnonymousSessionCount(uid: string): Promise<number> {
  const store = await readStore();
  return store[uid]?.sessionCount ?? 0;
}

export async function shouldShowAccountUpgradePrompt(uid: string): Promise<boolean> {
  const store = await readStore();
  const record = store[uid];
  if (!record) {
    return false;
  }

  if (record.sessionCount < ACCOUNT_UPGRADE_SESSION_THRESHOLD) {
    return false;
  }

  if (record.snoozedUntil) {
    const snoozedUntilMs = Date.parse(record.snoozedUntil);
    if (!Number.isNaN(snoozedUntilMs) && snoozedUntilMs > Date.now()) {
      return false;
    }
  }

  return true;
}

export async function snoozeAccountUpgradePrompt(uid: string): Promise<void> {
  const store = await readStore();
  const current = store[uid] ?? createDefaultRecord();

  store[uid] = {
    ...current,
    snoozedUntil: new Date(Date.now() + UPGRADE_PROMPT_SNOOZE_MS).toISOString(),
  };

  await writeStore(store);
}

export async function clearAccountUpgradePrompt(uid: string): Promise<void> {
  const store = await readStore();
  const current = store[uid];
  if (!current) {
    return;
  }

  store[uid] = {
    ...current,
    snoozedUntil: null,
  };

  await writeStore(store);
}

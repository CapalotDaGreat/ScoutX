import { collection, doc, getDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import {
  FOOTBALL_SOURCES_COLLECTION,
  SCOUT_FOOTBALL_SOURCES_COLLECTION,
  isFootballSourceType,
  isFootballSourceVisibility,
  type ExternalFootballSource,
  type FootballSourceStatus,
  type PublicFootballSource,
} from '@/features/football-sources/core';

const STATUSES: readonly FootballSourceStatus[] = ['active', 'hidden', 'reported', 'removed'];

function toOwnerSource(id: string, data: Record<string, unknown>): ExternalFootballSource | null {
  if (typeof data.url !== 'string' || typeof data.providerId !== 'string' || !isFootballSourceType(data.sourceType)) {
    return null;
  }
  const status = STATUSES.find((value) => value === data.status) ?? 'active';
  return {
    id,
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
    providerId: data.providerId,
    providerName: typeof data.providerName === 'string' ? data.providerName : data.providerId,
    url: data.url,
    sourceType: data.sourceType,
    addedBy: 'player',
    addedAt: typeof data.addedAt === 'string' ? data.addedAt : '',
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
    provenance: 'self_reported_with_link',
    visibility: isFootballSourceVisibility(data.visibility) ? data.visibility : 'private',
    status,
    matchIds: Array.isArray(data.matchIds) ? data.matchIds.filter((item): item is string => typeof item === 'string') : [],
  };
}

export function toPublicSources(value: unknown): PublicFootballSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (
      typeof record.id !== 'string' ||
      typeof record.url !== 'string' ||
      typeof record.providerId !== 'string' ||
      !isFootballSourceType(record.sourceType)
    ) {
      return [];
    }
    return [
      {
        id: record.id,
        providerId: record.providerId,
        providerName: typeof record.providerName === 'string' ? record.providerName : record.providerId,
        url: record.url,
        sourceType: record.sourceType,
        provenance: 'self_reported_with_link' as const,
      },
    ];
  });
}

/** The owner's own links, live. Other people only ever read the server projections. */
export function subscribeToOwnFootballSources(
  uid: string,
  onChange: (sources: ExternalFootballSource[]) => void,
  onError: () => void,
): Unsubscribe {
  const db = getFirestoreDb();
  if (!db) {
    onChange([]);
    return () => undefined;
  }
  return onSnapshot(
    collection(db, 'players', uid, FOOTBALL_SOURCES_COLLECTION),
    (snapshot) => {
      const sources = snapshot.docs
        .map((item) => toOwnerSource(item.id, item.data()))
        .filter((item): item is ExternalFootballSource => item !== null)
        .sort((a, b) => a.addedAt.localeCompare(b.addedAt));
      onChange(sources);
    },
    onError,
  );
}

/** Links a player shared with scouts; readable by recruiter accounts only. */
export async function fetchScoutFootballSources(playerId: string): Promise<PublicFootballSource[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const snapshot = await getDoc(doc(db, SCOUT_FOOTBALL_SOURCES_COLLECTION, playerId));
    return snapshot.exists() ? toPublicSources(snapshot.get('sources')) : [];
  } catch {
    return [];
  }
}

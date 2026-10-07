import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import type { PipelineStage, WatchlistEvent } from '@/features/scout-intelligence/types';

const STAGES: readonly PipelineStage[] = [
  'discovered',
  'shortlisted',
  'contacted',
  'invited',
  'trial',
  'evaluated',
  'follow_up',
];

function asStage(value: unknown): PipelineStage | null {
  return typeof value === 'string' && (STAGES as readonly string[]).includes(value) ? (value as PipelineStage) : null;
}

export function parseWatchlistEvent(id: string, data: Record<string, unknown>, scoutId: string): WatchlistEvent {
  const changes = Array.isArray(data.changes)
    ? data.changes.filter((item): item is 'match' | 'video' => item === 'match' || item === 'video')
    : [];
  return {
    id,
    scoutId: typeof data.scoutId === 'string' ? data.scoutId : scoutId,
    playerId: typeof data.playerId === 'string' ? data.playerId : '',
    type:
      data.type === 'stage_changed' || data.type === 'new_evidence' || data.type === 'removed'
        ? data.type
        : 'added',
    changes,
    fromStage: asStage(data.fromStage),
    toStage: asStage(data.toStage),
    lastEvidenceAt: typeof data.lastEvidenceAt === 'string' ? data.lastEvidenceAt : null,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
  };
}

export function useWatchlistEvents(scoutId: string | null, max = 30) {
  const [events, setEvents] = useState<WatchlistEvent[]>([]);
  const [failed, setFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(scoutId));

  useEffect(() => {
    const db = scoutId ? getFirestoreDb() : null;
    if (!scoutId || !db) {
      setEvents([]);
      setIsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setIsLoading(true);
    getDocs(
      query(collection(db, 'watchlistEvents'), where('scoutId', '==', scoutId), orderBy('createdAt', 'desc'), limit(max)),
    )
      .then((snapshot) => {
        if (cancelled) return;
        setEvents(snapshot.docs.map((item) => parseWatchlistEvent(item.id, item.data(), scoutId)));
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) {
          setEvents([]);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [max, scoutId]);

  return { events, failed, isLoading };
}

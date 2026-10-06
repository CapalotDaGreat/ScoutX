import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { getFirestoreDb } from '@/config/firebase';
import type { WatchlistEvent } from '@/features/scout-intelligence/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type WatchlistEventsCardProps = {
  scoutId: string | null;
};

export function WatchlistEventsCard({ scoutId }: WatchlistEventsCardProps) {
  const { t } = useAppTranslation(['scout']);
  const [events, setEvents] = useState<WatchlistEvent[]>([]);

  useEffect(() => {
    if (!scoutId) {
      setEvents([]);
      return;
    }
    const db = getFirestoreDb();
    if (!db) {
      setEvents([]);
      return;
    }
    void getDocs(
      query(
        collection(db, 'watchlistEvents'),
        where('scoutId', '==', scoutId),
        orderBy('createdAt', 'desc'),
        limit(8),
      ),
    )
      .then((snapshot) => {
        setEvents(
          snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              scoutId: String(data.scoutId ?? scoutId),
              playerId: String(data.playerId ?? ''),
              type: data.type === 'stage_changed' || data.type === 'new_evidence' || data.type === 'removed' ? data.type : 'added',
              fromStage: typeof data.fromStage === 'string' ? data.fromStage : null,
              toStage: typeof data.toStage === 'string' ? data.toStage : null,
              lastEvidenceAt: typeof data.lastEvidenceAt === 'string' ? data.lastEvidenceAt : null,
              createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
            } as WatchlistEvent;
          }),
        );
      })
      .catch(() => setEvents([]));
  }, [scoutId]);

  return (
    <Card variant="outlined" padding="md" className="gap-2">
      <Text variant="body" className="font-sans-semibold">{t('scout:intelligence.watchlistTitle')}</Text>
      {events.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('scout:intelligence.watchlistEmpty')}
        </Text>
      ) : (
        events.map((event) => (
          <Text key={event.id} variant="caption" color="secondary">
            {t(`scout:intelligence.watch.${event.type}`)} · {event.playerId}
          </Text>
        ))
      )}
    </Card>
  );
}

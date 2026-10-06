import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { Badge } from '@/components/primitives/Badge';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { getFirestoreDb } from '@/config/firebase';
import { loadSeenAt, saveSeenAt } from '@/features/intelligence/services/snapshotStore';
import type { WatchlistEvent } from '@/features/scout-intelligence/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type WatchlistEventsCardProps = {
  scoutId: string | null;
  /** Names for players the scout tracks; unknown ids fall back to a neutral label. */
  playerNames?: Record<string, string>;
  onPlayerPress?: (playerId: string) => void;
};

const SEEN_SCOPE = 'watchlist';

/**
 * Recent watchlist events, with everything that happened since the scout last opened this
 * card marked as new. Viewing the card moves the marker forward for the next visit.
 */
export function WatchlistEventsCard({ scoutId, playerNames = {}, onPlayerPress }: WatchlistEventsCardProps) {
  const { t, i18n } = useAppTranslation(['scout']);
  const [events, setEvents] = useState<WatchlistEvent[]>([]);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

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
    let cancelled = false;
    void Promise.all([
      loadSeenAt(scoutId, SEEN_SCOPE),
      getDocs(
        query(
          collection(db, 'watchlistEvents'),
          where('scoutId', '==', scoutId),
          orderBy('createdAt', 'desc'),
          limit(8),
        ),
      ),
    ])
      .then(([previousSeenAt, snapshot]) => {
        if (cancelled) return;
        const next = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            scoutId: String(data.scoutId ?? scoutId),
            playerId: String(data.playerId ?? ''),
            type: data.type === 'stage_changed' || data.type === 'new_evidence' || data.type === 'removed' ? data.type : 'added',
            fromStage: typeof data.fromStage === 'string' ? data.fromStage : null,
            toStage: typeof data.toStage === 'string' ? data.toStage : null,
            lastEvidenceAt: typeof data.lastEvidenceAt === 'string' ? data.lastEvidenceAt : null,
            createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
          } as WatchlistEvent;
        });
        setSeenAt(previousSeenAt);
        setEvents(next);
        setFailed(false);
        if (next[0]?.createdAt) {
          void saveSeenAt(scoutId, SEEN_SCOPE, next[0].createdAt);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setEvents([]);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [scoutId]);

  const newCount = useMemo(
    () => (seenAt === null ? 0 : events.filter((event) => event.createdAt > seenAt).length),
    [events, seenAt],
  );

  const formatDate = (iso: string): string =>
    Number.isNaN(Date.parse(iso))
      ? ''
      : new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(new Date(iso));

  return (
    <Card variant="outlined" padding="md" className="gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="body" className="font-sans-semibold" accessibilityRole="header">
          {t('scout:intelligence.watchlistTitle')}
        </Text>
        {newCount > 0 ? (
          <Badge label={t('scout:intelligence.watchNewCount', { count: newCount })} variant="accent" size="sm" />
        ) : null}
      </View>
      {failed ? (
        <Text variant="body-sm" color="warning">
          {t('scout:intelligence.watchlistError')}
        </Text>
      ) : events.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('scout:intelligence.watchlistEmpty')}
        </Text>
      ) : (
        events.map((event) => {
          const isNew = seenAt !== null && event.createdAt > seenAt;
          const name = playerNames[event.playerId] || t('scout:intelligence.watchUnknownPlayer');
          const label = `${t(`scout:intelligence.watch.${event.type}`)} · ${name}`;
          const date = formatDate(event.createdAt);
          const content = (
            <View className="flex-row items-center gap-2">
              <Text variant="caption" color={isNew ? 'primary' : 'secondary'} className="min-w-0 flex-1" numberOfLines={2}>
                {label}
                {date ? ` · ${date}` : ''}
              </Text>
              {isNew ? <Badge label={t('scout:intelligence.watchNew')} variant="accent" size="sm" /> : null}
            </View>
          );
          return onPlayerPress && event.type !== 'removed' ? (
            <Pressable
              key={event.id}
              accessibilityRole="button"
              accessibilityLabel={isNew ? `${t('scout:intelligence.watchNew')}: ${label}` : label}
              onPress={() => onPlayerPress(event.playerId)}
              className="min-h-11 justify-center active:opacity-80"
            >
              {content}
            </Pressable>
          ) : (
            <View key={event.id}>{content}</View>
          );
        })
      )}
    </Card>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { loadSeenAt, saveSeenAt } from '@/features/intelligence/services/snapshotStore';
import { useWatchlistEvents } from '@/features/scout-intelligence/hooks/useWatchlistEvents';
import {
  filterWatchlistEvents,
  type WatchlistFilter,
} from '@/features/scout-intelligence/services/scoutDecisionSupport';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type WatchlistEventsCardProps = {
  scoutId: string | null;
  /** Names for players the scout tracks; unknown ids fall back to a neutral label. */
  playerNames?: Record<string, string>;
  onPlayerPress?: (playerId: string) => void;
};

const SEEN_SCOPE = 'watchlist';
const VISIBLE = 8;
const FILTERS: readonly WatchlistFilter[] = ['all', 'match', 'video', 'pipeline', 'trial', 'removed'];

/**
 * Recent watchlist events, with everything that happened since the scout last opened this
 * card marked as new. Viewing the card moves the marker forward for the next visit.
 */
export function WatchlistEventsCard({ scoutId, playerNames = {}, onPlayerPress }: WatchlistEventsCardProps) {
  const { t, i18n } = useAppTranslation(['scout']);
  const { events, failed } = useWatchlistEvents(scoutId);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [filter, setFilter] = useState<WatchlistFilter>('all');

  useEffect(() => {
    if (!scoutId || events.length === 0) return;
    let cancelled = false;
    void loadSeenAt(scoutId, SEEN_SCOPE).then((previous) => {
      if (cancelled) return;
      setSeenAt(previous);
      if (events[0]?.createdAt) {
        void saveSeenAt(scoutId, SEEN_SCOPE, events[0].createdAt);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [events, scoutId]);

  const newCount = useMemo(
    () => (seenAt === null ? 0 : events.filter((event) => event.createdAt > seenAt).length),
    [events, seenAt],
  );
  const visible = useMemo(() => filterWatchlistEvents(events, filter).slice(0, VISIBLE), [events, filter]);

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
      {events.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {FILTERS.map((item) => (
            <Button
              key={item}
              size="sm"
              variant={filter === item ? 'primary' : 'secondary'}
              accessibilityState={{ selected: filter === item }}
              onPress={() => setFilter(item)}
            >
              {t(`scout:intelligence.watchFilter.${item}`)}
            </Button>
          ))}
        </ScrollView>
      ) : null}
      {failed ? (
        <Text variant="body-sm" color="warning">
          {t('scout:intelligence.watchlistError')}
        </Text>
      ) : events.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('scout:intelligence.watchlistEmpty')}
        </Text>
      ) : visible.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('scout:intelligence.watchFilterEmpty')}
        </Text>
      ) : (
        visible.map((event) => {
          const isNew = seenAt !== null && event.createdAt > seenAt;
          const name = playerNames[event.playerId] || t('scout:intelligence.watchUnknownPlayer');
          const detail =
            event.changes.length > 0
              ? ` (${event.changes.map((change) => t(`scout:intelligence.watchChanges.${change}`)).join(', ')})`
              : '';
          const label = `${t(`scout:intelligence.watch.${event.type}`)}${detail} · ${name}`;
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

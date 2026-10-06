import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { type MatchHistoryItem } from '@/features/player-statistics/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { formatRating } from '@/features/player-statistics/utils/recordedStats';

export type MatchHistoryProps = {
  items: MatchHistoryItem[];
  maxItems?: number;
  onViewAllPress?: () => void;
  /** Lighter chrome when embedded under a parent section heading. */
  compact?: boolean;
};

function formatMatchDate(date: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export function MatchHistory({
  items,
  maxItems,
  onViewAllPress,
  compact = false,
}: MatchHistoryProps) {
  const { t } = useAppTranslation('common');
  const visibleItems = maxItems ? items.slice(0, maxItems) : items;
  const hasMore = Boolean(maxItems && items.length > maxItems);

  const list = (
    <View className="gap-3">
      {visibleItems.map((item) => (
        <View
          key={item.id}
          className="rounded-xl border border-border bg-background-secondary p-4"
        >
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text weight="semibold">{item.opponent}</Text>
              <Text variant="caption" color="secondary" className="mt-1">
                {item.competition} - {formatMatchDate(item.date)}
              </Text>
            </View>
            <Text weight="bold" color={item.result.startsWith('W') ? 'success' : 'secondary'}>
              {item.result}
            </Text>
          </View>

          <View className="mt-3 flex-row items-center justify-between gap-3">
            <Text variant="body-sm" color="secondary" className="min-w-0 flex-1">
              {item.summary}
            </Text>
            <Text weight="semibold" color="accent">
              {formatRating(item.stats.matchRating)}
            </Text>
          </View>

          <View className="mt-3 flex-row flex-wrap gap-2">
            <Text variant="caption" className="rounded-lg bg-surface px-2 py-1">
              {item.stats.minutes} min
            </Text>
            <Text variant="caption" className="rounded-lg bg-surface px-2 py-1">
              {item.stats.goals}G
            </Text>
            <Text variant="caption" className="rounded-lg bg-surface px-2 py-1">
              {item.stats.assists}A
            </Text>
            {!compact ? (
              <>
                <Text variant="caption" className="rounded-lg bg-surface px-2 py-1">
                  {item.stats.shots} shots
                </Text>
                <Text variant="caption" className="rounded-lg bg-surface px-2 py-1">
                  {item.stats.tackles} tackles
                </Text>
                <Text variant="caption" className="rounded-lg bg-surface px-2 py-1">
                  {item.stats.yellowCards} YC
                </Text>
                <Text variant="caption" className="rounded-lg bg-surface px-2 py-1">
                  {item.stats.redCards} RC
                </Text>
              </>
            ) : null}
          </View>

          {!compact && item.notes ? (
            <Text variant="caption" color="secondary" className="mt-3">
              {item.notes}
            </Text>
          ) : null}
        </View>
      ))}

      {hasMore && onViewAllPress && compact ? (
        <Button variant="ghost" size="sm" onPress={onViewAllPress} className="self-start">
          {t('viewAll')} · {items.length}
        </Button>
      ) : null}
    </View>
  );

  if (compact) {
    return list;
  }

  return (
    <Card variant="default" padding="lg" className="gap-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Heading level={3}>Match History</Heading>
          <Text variant="body-sm" color="secondary" className="mt-1">
            Latest performances with calculated match output.
          </Text>
        </View>
        {hasMore && onViewAllPress ? (
          <Button variant="ghost" size="sm" onPress={onViewAllPress}>
            {t('viewAll')}
          </Button>
        ) : null}
      </View>
      {list}
    </Card>
  );
}

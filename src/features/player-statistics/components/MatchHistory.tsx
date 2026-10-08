import { type ReactNode } from 'react';
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
  renderItemFooter?: (item: MatchHistoryItem) => ReactNode;
};

function formatMatchDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export function MatchHistory({
  items,
  maxItems,
  onViewAllPress,
  compact = false,
  renderItemFooter,
}: MatchHistoryProps) {
  const { t, i18n } = useAppTranslation(['common', 'statistics']);
  const summaryFor = (item: MatchHistoryItem) =>
    [
      t('statistics:history.contributions', { count: item.stats.goals + item.stats.assists }),
      item.stats.passAccuracy !== null ? t('statistics:history.passing', { pct: item.stats.passAccuracy }) : null,
      t(item.stats.cleanSheet ? 'statistics:history.cleanSheet' : 'statistics:history.conceded'),
    ]
      .filter((part): part is string => part !== null)
      .join(', ');
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
                {[item.competition, formatMatchDate(item.date, i18n.language)].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Text weight="bold" color={item.result.startsWith('W') ? 'success' : 'secondary'}>
              {item.result}
            </Text>
          </View>

          <View className="mt-3 flex-row items-center justify-between gap-3">
            <Text variant="body-sm" color="secondary" className="min-w-0 flex-1">
              {summaryFor(item)}
            </Text>
            <Text weight="semibold" color="accent">
              {formatRating(item.stats.matchRating)}
            </Text>
          </View>

          <View className="mt-3 flex-row flex-wrap gap-2">
            <Text variant="caption" className="rounded-lg bg-surface px-2 py-1">
              {t('statistics:history.minutes', { count: item.stats.minutes })}
            </Text>
            <Text variant="caption" className="rounded-lg bg-surface px-2 py-1">
              {t('statistics:history.goals', { count: item.stats.goals })}
            </Text>
            <Text variant="caption" className="rounded-lg bg-surface px-2 py-1">
              {t('statistics:history.assists', { count: item.stats.assists })}
            </Text>
            {!compact ? (
              <>
                {item.stats.shots !== null ? (
                  <Text variant="caption" className="rounded-lg bg-surface px-2 py-1">
                    {t('statistics:history.shots', { count: item.stats.shots })}
                  </Text>
                ) : null}
                {item.stats.tackles !== null ? (
                  <Text variant="caption" className="rounded-lg bg-surface px-2 py-1">
                    {t('statistics:history.tackles', { count: item.stats.tackles })}
                  </Text>
                ) : null}
                <Text variant="caption" className="rounded-lg bg-surface px-2 py-1">
                  {t('statistics:history.yellow', { count: item.stats.yellowCards })}
                </Text>
                <Text variant="caption" className="rounded-lg bg-surface px-2 py-1">
                  {t('statistics:history.red', { count: item.stats.redCards })}
                </Text>
              </>
            ) : null}
          </View>

          {!compact && item.notes ? (
            <Text variant="caption" color="secondary" className="mt-3">
              {item.notes}
            </Text>
          ) : null}
          {renderItemFooter?.(item)}
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
          <Heading level={3}>{t('statistics:matchHistory')}</Heading>
          <Text variant="body-sm" color="secondary" className="mt-1">
            {t('statistics:history.subtitle')}
          </Text>
        </View>
        {hasMore && onViewAllPress ? (
          <Button variant="ghost" size="sm" onPress={onViewAllPress}>
            {t('common:viewAll')}
          </Button>
        ) : null}
      </View>
      {list}
    </Card>
  );
}

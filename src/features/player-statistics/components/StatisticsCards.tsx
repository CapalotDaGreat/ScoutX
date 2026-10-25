import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { Text } from '@/components/primitives/Text';
import { type StatisticSummaryItem } from '@/features/player-statistics/types';
import { useStatisticLabels } from '@/features/player-statistics/hooks/useStatisticLabels';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export type StatisticsCardsProps = {
  items: StatisticSummaryItem[];
  /** Keys shown immediately. Remaining metrics sit behind "All metrics". */
  primaryKeys?: string[];
};

const DEFAULT_PRIMARY_KEYS = ['matches', 'goals', 'assists', 'minutes'];

function MetricGrid({ items }: { items: StatisticSummaryItem[] }) {
  const labels = useStatisticLabels();
  return (
    <View className="flex-row flex-wrap border-t border-border">
      {items.map((item) => (
        <View key={item.key} className="min-w-[45%] flex-1 gap-1 border-b border-border px-2 py-4">
          <Text variant="label" color="secondary">{labels.metric(item.key)}</Text>
          <Text weight="bold" className="text-stat-lg">{item.formattedValue}</Text>
          <Text variant="caption" color="secondary">{labels.trend(item.trend)}</Text>
          <Text variant="caption" color="secondary">
            {labels.average(item.key, item.formattedAverage)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function StatisticsCards({ items, primaryKeys = DEFAULT_PRIMARY_KEYS }: StatisticsCardsProps) {
  const primarySet = new Set(primaryKeys.map((key) => key.toLowerCase()));
  const primary = items.filter((item) => primarySet.has(item.key.toLowerCase())).slice(0, 4);
  const resolvedPrimary = primary.length > 0 ? primary : items.slice(0, 4);
  const primaryIds = new Set(resolvedPrimary.map((item) => item.key));
  const secondary = items.filter((item) => !primaryIds.has(item.key));
  const { t } = useAppTranslation('statistics');
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View entering={reduceMotion ? undefined : FadeInUp.duration(450)} className="gap-5">
      <MetricGrid items={resolvedPrimary} />
      {secondary.length > 0 ? (
        <CollapsibleSection
          title={t('summary.allMetrics')}
          subtitle={t('summary.moreMetrics', { count: secondary.length })}
          persistKey="stats-all-metrics"
        >
          <MetricGrid items={secondary} />
        </CollapsibleSection>
      ) : null}
    </Animated.View>
  );
}

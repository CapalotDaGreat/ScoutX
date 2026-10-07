import { memo } from 'react';
import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { COMPARISON_PLAYER_COLORS } from '@/features/player-comparison/constants';
import { getMetricDelta } from '@/features/player-comparison/services/comparisonMetricsService';
import { type ComparisonMetricRow } from '@/features/player-comparison/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { cn } from '@/utils/cn';

export type ComparisonMetricTableProps = {
  rows: ComparisonMetricRow[];
  playerIds: string[];
  playerNames: Record<string, string>;
};

const deltaStyles = {
  best: 'bg-accent-muted',
  worst: 'bg-error-muted',
  neutral: '',
} as const;

const deltaTextStyles = {
  best: 'text-accent',
  worst: 'text-error',
  neutral: '',
} as const;

const deltaMarkers = {
  best: ' ▲',
  worst: ' ▼',
  neutral: '',
} as const;

export const ComparisonMetricTable = memo(function ComparisonMetricTable({
  rows,
  playerIds,
  playerNames,
}: ComparisonMetricTableProps) {
  const { t } = useAppTranslation('scout');

  if (rows.length === 0 || playerIds.length === 0) {
    return null;
  }

  return (
    <Card variant="outlined" padding="none" className="overflow-hidden">
      <View className="flex-row border-b border-divider bg-background-secondary">
        <View className="w-[38%] justify-center px-3 py-3">
          <Text variant="caption" className="font-sans-semibold uppercase text-foreground-secondary">
            {t('comparisonUi.metricHeader')}
          </Text>
        </View>
        {playerIds.map((playerId, index) => (
          <View key={playerId} className="flex-1 justify-center px-2 py-3">
            <View className="flex-row items-center gap-1.5">
              <View
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: COMPARISON_PLAYER_COLORS[index] }}
              />
              <Text variant="caption" numberOfLines={1} className="font-sans-semibold">
                {playerNames[playerId] ?? t('comparisonUi.playerFallback')}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {rows.map((row, rowIndex) => {
        const metricLabel = t(`comparisonMetric.${row.key}`);
        return (
          <View
            key={row.key}
            className={cn(
              'flex-row border-b border-divider',
              rowIndex === rows.length - 1 && 'border-b-0',
            )}
          >
            <View className="w-[38%] justify-center px-3 py-3">
              <Text variant="body-sm" color="secondary">
                {metricLabel}
              </Text>
            </View>
            {playerIds.map((playerId) => {
              const value = row.values.find((item) => item.playerId === playerId);
              const delta = getMetricDelta(row, playerId);
              const display = value?.display ?? '-';
              const playerName = playerNames[playerId] ?? t('comparisonUi.playerFallback');
              const a11yLabel =
                delta === 'neutral'
                  ? t('comparisonUi.cellA11y', { metric: metricLabel, player: playerName, value: display })
                  : t(delta === 'best' ? 'comparisonUi.cellBestA11y' : 'comparisonUi.cellWorstA11y', {
                      metric: metricLabel,
                      player: playerName,
                      value: display,
                    });

              return (
                <View
                  key={`${row.key}-${playerId}`}
                  accessible
                  accessibilityLabel={a11yLabel}
                  className={cn('flex-1 justify-center px-2 py-3', deltaStyles[delta])}
                >
                  <Text
                    variant="body-sm"
                    className={cn('font-sans-semibold', deltaTextStyles[delta])}
                  >
                    {display}
                    {deltaMarkers[delta]}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      })}
    </Card>
  );
});

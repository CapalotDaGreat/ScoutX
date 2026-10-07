import { memo, useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { COMPARISON_PLAYER_COLORS } from '@/features/player-comparison/constants';
import { type ComparisonTrendPoint } from '@/features/player-comparison/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

export type ComparisonTrendChartProps = {
  trends: ComparisonTrendPoint[];
  playerIds: string[];
  playerNames: Record<string, string>;
};

const chartWidth = 320;
const chartHeight = 140;
const padding = { top: 12, right: 12, bottom: 28, left: 12 };
/** Form points: win 3, draw 1, loss 0. A shared scale keeps players comparable. */
const MAX_FORM_POINTS = 3;

function buildSeries(
  trends: ComparisonTrendPoint[],
  playerId: string,
): Array<{ x: number; y: number; label: string }> {
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  const divisor = Math.max(trends.length - 1, 1);

  return trends.flatMap((point, index) => {
    const value = point.values[playerId];
    if (value === undefined) {
      return [];
    }
    const x = padding.left + (innerWidth * index) / divisor;
    const y = padding.top + innerHeight - (value / MAX_FORM_POINTS) * innerHeight;
    return [{ x, y, label: point.label }];
  });
}

export const ComparisonTrendChart = memo(function ComparisonTrendChart({
  trends,
  playerIds,
  playerNames,
}: ComparisonTrendChartProps) {
  const { t } = useAppTranslation('scout');
  const { colors } = useTheme();
  const series = useMemo(
    () =>
      playerIds.map((playerId, index) => ({
        playerId,
        color: COMPARISON_PLAYER_COLORS[index],
        points: buildSeries(trends, playerId),
      })),
    [playerIds, trends],
  );

  if (trends.length === 0 || playerIds.length === 0) {
    return null;
  }

  const labelStep = Math.max(Math.ceil(trends.length / 4), 1);
  const summary = series
    .map((item) => {
      const name = playerNames[item.playerId] ?? t('comparisonUi.playerFallback');
      const values = trends
        .map((point) => point.values[item.playerId])
        .filter((value): value is number => value !== undefined);
      return values.length > 0
        ? t('comparisonUi.trendPlayerA11y', { name, values: values.join(', ') })
        : t('comparisonUi.trendPlayerEmptyA11y', { name });
    })
    .join('. ');

  return (
    <Card variant="default" padding="lg" className="gap-4">
      <View className="flex-row flex-wrap gap-3">
        {series.map((item) => (
          <View key={item.playerId} className="flex-row items-center gap-2">
            <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <Text variant="caption" className="font-sans-semibold">
              {playerNames[item.playerId] ?? t('comparisonUi.playerFallback')}
            </Text>
          </View>
        ))}
      </View>

      <Text variant="caption" color="secondary">
        {t('comparisonUi.trendScale')}
      </Text>

      <View
        className="items-center"
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${t('comparisonUi.trendA11y')}. ${summary}`}
      >
        <Svg width={chartWidth} height={chartHeight}>
          <Line
            x1={padding.left}
            y1={chartHeight - padding.bottom}
            x2={chartWidth - padding.right}
            y2={chartHeight - padding.bottom}
            stroke={colors.border}
            strokeWidth={1}
          />

          {series.map((item) => {
            const polyline = item.points.map((point) => `${point.x},${point.y}`).join(' ');
            return (
              <Polyline
                key={item.playerId}
                points={polyline}
                fill="none"
                stroke={item.color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {series.flatMap((item) =>
            item.points.map((point) => (
              <Circle
                key={`${item.playerId}-${point.label}`}
                cx={point.x}
                cy={point.y}
                r={3}
                fill={item.color}
              />
            )),
          )}
        </Svg>
      </View>

      <View className="flex-row flex-wrap justify-between gap-2 px-1" importantForAccessibility="no-hide-descendants">
        {trends.map((point, index) =>
          index % labelStep === 0 || index === trends.length - 1 ? (
            <Text key={point.label} variant="caption" color="secondary" className="text-center">
              {t('comparisonUi.matchShort', { n: point.label })}
            </Text>
          ) : null,
        )}
      </View>
    </Card>
  );
});

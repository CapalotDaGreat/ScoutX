import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { type ProgressGraph } from '@/features/player-statistics/types';
import { useStatisticLabels } from '@/features/player-statistics/hooks/useStatisticLabels';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ProgressGraphsProps = {
  graphs: ProgressGraph[];
};

const graphWidth = 132;
const graphHeight = 52;
const graphPadding = 8;

const trendColors = {
  up: 'text-success',
  down: 'text-error',
  neutral: 'text-foreground-secondary',
} as const;

function getPolylinePoints(graph: ProgressGraph): string {
  const values = graph.points.map((point) => point.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const availableWidth = graphWidth - graphPadding * 2;
  const availableHeight = graphHeight - graphPadding * 2;
  const divisor = Math.max(graph.points.length - 1, 1);

  return graph.points
    .map((point, index) => {
      const x = graphPadding + (availableWidth * index) / divisor;
      const y = graphPadding + availableHeight - ((point.value - min) / range) * availableHeight;
      return `${x},${y}`;
    })
    .join(' ');
}

export function ProgressGraphs({ graphs }: ProgressGraphsProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('statistics');
  const labels = useStatisticLabels();
  const graphPoints = useMemo(
    () => graphs.map((graph) => ({ key: graph.key, points: getPolylinePoints(graph) })),
    [graphs],
  );

  return (
    <Card variant="default" padding="lg" className="gap-4">
      <View>
        <Heading level={3}>{t('charts.progressTitle')}</Heading>
        <Text variant="body-sm" color="secondary" className="mt-1">
          {t('charts.progressSubtitle')}
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-3">
        {graphs.map((graph) => {
          const currentGraphPoints = graphPoints.find((item) => item.key === graph.key);
          const lastPoint = graph.points[graph.points.length - 1];
          const metricLabel = labels.metric(graph.key);
          const trendLabel = labels.trend(graph.trend);

          return (
            <View
              key={graph.key}
              className="min-w-[45%] flex-1 rounded-lg border border-border bg-background-secondary p-3"
            >
              <View className="mb-2 flex-row items-start justify-between gap-2">
                <View className="flex-1">
                  <Text variant="caption" color="secondary" className="uppercase">
                    {metricLabel}
                  </Text>
                  <Text weight="bold">{lastPoint?.formattedValue ?? '—'}</Text>
                </View>
                <Text
                  variant="caption"
                  className={cn('text-right', trendColors[graph.trend.direction])}
                >
                  {trendLabel}
                </Text>
              </View>

              <Svg
                width={graphWidth}
                height={graphHeight}
                accessible
                accessibilityRole="image"
                accessibilityLabel={t('charts.progressA11y', {
                  metric: metricLabel,
                  values: graph.points.map((point) => point.formattedValue).join(', '),
                  trend: trendLabel,
                })}
              >
                <Line
                  x1={graphPadding}
                  y1={graphHeight - graphPadding}
                  x2={graphWidth - graphPadding}
                  y2={graphHeight - graphPadding}
                  stroke={colors.border}
                  strokeWidth={1}
                />
                <Polyline
                  points={currentGraphPoints?.points ?? ''}
                  fill="none"
                  stroke={colors.accent}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {currentGraphPoints?.points.split(' ').map((point, index, all) => {
                  const [xValue, yValue] = point.split(',');
                  const isPeak = index === all.length - 1 && graph.trend.direction === 'up';
                  return (
                    <Circle
                      key={point}
                      cx={Number(xValue)}
                      cy={Number(yValue)}
                      r={isPeak ? 3 : 2}
                      fill={isPeak ? colors.gold : colors.accent}
                    />
                  );
                })}
              </Svg>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

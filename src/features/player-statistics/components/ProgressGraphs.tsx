import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { type ProgressGraph } from '@/features/player-statistics/types';

export type ProgressGraphsProps = {
  graphs: ProgressGraph[];
};

const graphWidth = 132;
const graphHeight = 52;
const graphPadding = 8;

const trendColors = {
  up: 'text-success dark:text-green-400',
  down: 'text-error dark:text-red-400',
  neutral: 'text-foreground-secondary dark:text-neutral-400',
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
  const graphPoints = useMemo(
    () => graphs.map((graph) => ({ key: graph.key, points: getPolylinePoints(graph) })),
    [graphs],
  );

  return (
    <Card variant="default" padding="lg" className="gap-4">
      <View>
        <Heading level={3}>Progress Graphs</Heading>
        <Text variant="body-sm" color="secondary" className="mt-1">
          Recent match-by-match movement.
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-3">
        {graphs.map((graph) => {
          const currentGraphPoints = graphPoints.find((item) => item.key === graph.key);
          const lastPoint = graph.points[graph.points.length - 1];

          return (
            <View
              key={graph.key}
              className="min-w-[45%] flex-1 rounded-lg border border-border bg-background-secondary p-3 dark:border-neutral-800 dark:bg-neutral-950"
            >
              <View className="mb-2 flex-row items-start justify-between gap-2">
                <View className="flex-1">
                  <Text variant="caption" color="secondary" className="uppercase">
                    {graph.label}
                  </Text>
                  <Text weight="bold">{lastPoint?.formattedValue ?? '0'}</Text>
                </View>
                <Text
                  variant="caption"
                  className={cn('text-right', trendColors[graph.trend.direction])}
                >
                  {graph.trend.value}
                </Text>
              </View>

              <Svg width={graphWidth} height={graphHeight} accessibilityLabel={`${graph.label} trend`}>
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
                {currentGraphPoints?.points.split(' ').map((point) => {
                  const [xValue, yValue] = point.split(',');
                  return (
                    <Circle
                      key={point}
                      cx={Number(xValue)}
                      cy={Number(yValue)}
                      r={2}
                      fill={colors.accent}
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

import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { type RadarChartPoint } from '@/features/player-statistics/types';
import {
  getRadarCoordinate,
  RADAR_GRID_LEVELS,
  toRadarPointString,
} from '@/features/player-statistics/utils/radarGeometry';

export type RadarChartProps = {
  points: RadarChartPoint[];
};

const chartSize = 260;
const center = chartSize / 2;
const radius = 84;
const labelRadius = 112;

export function RadarChart({ points }: RadarChartProps) {
  const { colors } = useTheme();

  const chart = useMemo(() => {
    const total = Math.max(points.length, 1);
    const valueCoordinates = points.map((point, index) =>
      getRadarCoordinate(center, index, total, radius * point.normalizedValue),
    );

    return {
      total,
      valuePoints: toRadarPointString(valueCoordinates),
      axes: points.map((point, index) => ({
        point,
        end: getRadarCoordinate(center, index, total, radius),
        label: getRadarCoordinate(center, index, total, labelRadius),
      })),
      grids: RADAR_GRID_LEVELS.map((level) =>
        toRadarPointString(
          points.map((_, index) => getRadarCoordinate(center, index, total, radius * level)),
        ),
      ),
    };
  }, [points]);

  return (
    <Card variant="default" padding="lg" className="gap-4">
      <View>
        <Heading level={3}>Radar Chart</Heading>
        <Text variant="body-sm" color="secondary" className="mt-1">
          Normalized profile across all tracked metrics.
        </Text>
      </View>

      <View className="items-center">
        <Svg width={chartSize} height={chartSize} accessibilityLabel="Player statistics radar chart">
          {chart.grids.map((grid, index) => (
            <Polygon
              key={grid}
              points={grid}
              fill="none"
              stroke={colors.border}
              strokeWidth={index === chart.grids.length - 1 ? 1.5 : 1}
            />
          ))}

          {chart.axes.map(({ point, end, label }) => (
            <G key={point.key}>
              <Line
                x1={center}
                y1={center}
                x2={end.x}
                y2={end.y}
                stroke={colors.borderStrong}
                strokeWidth={1}
              />
              <SvgText
                x={label.x}
                y={label.y}
                fill={colors.textSecondary}
                fontSize={11}
                fontWeight="600"
                textAnchor="middle"
                alignmentBaseline="middle"
              >
                {point.label}
              </SvgText>
            </G>
          ))}

          <Polygon
            points={chart.valuePoints}
            fill={colors.accent}
            fillOpacity={0.2}
            stroke={colors.accent}
            strokeWidth={2}
          />
          <Circle cx={center} cy={center} r={2.5} fill={colors.accent} />
        </Svg>
      </View>
    </Card>
  );
}

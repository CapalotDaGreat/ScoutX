import { memo, useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { COMPARISON_PLAYER_COLORS } from '@/features/player-comparison/constants';
import { type ComparisonPlayerProfile } from '@/features/player-comparison/types';
import {
  getRadarCoordinate,
  RADAR_GRID_LEVELS,
  toRadarPointString,
} from '@/features/player-statistics/utils/radarGeometry';
import { useTheme } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ComparisonRadarChartProps = {
  profiles: ComparisonPlayerProfile[];
};

const chartSize = 280;
const center = chartSize / 2;
const radius = 88;
const labelRadius = 118;

export const ComparisonRadarChart = memo(function ComparisonRadarChart({
  profiles,
}: ComparisonRadarChartProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('scout');

  const chart = useMemo(() => {
    const axisLabels = profiles[0]?.radarStats.map((stat) => stat.label) ?? [];
    const total = Math.max(axisLabels.length, 1);

    const grids = RADAR_GRID_LEVELS.map((level) =>
      toRadarPointString(
        axisLabels.map((_, index) => getRadarCoordinate(center, index, total, radius * level)),
      ),
    );

    const axes = axisLabels.map((label, index) => ({
      label,
      end: getRadarCoordinate(center, index, total, radius),
      text: getRadarCoordinate(center, index, total, labelRadius),
    }));

    const polygons = profiles.map((profile) => {
      const valueCoordinates = axisLabels.map((label, index) => {
        const stat = profile.radarStats.find((item) => item.label === label);
        const value = stat?.value ?? 0;
        return getRadarCoordinate(center, index, total, radius * Math.min(value, 1));
      });
      return toRadarPointString(valueCoordinates);
    });

    return { total, grids, axes, polygons };
  }, [profiles]);

  if (profiles.length === 0) {
    return null;
  }

  return (
    <Card variant="default" padding="lg" className="gap-4">
      <View className="flex-row flex-wrap gap-3">
        {profiles.map((profile, index) => (
          <View key={profile.player.id} className="flex-row items-center gap-2">
            <View
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COMPARISON_PLAYER_COLORS[index] }}
            />
            <Text variant="caption" className="font-sans-semibold">
              {profile.player.fullName}
            </Text>
          </View>
        ))}
      </View>

      <View className="items-center">
        <Svg
          width={chartSize}
          height={chartSize}
          accessibilityLabel={t('comparisonUi.radarA11y')}
        >
          {chart.grids.map((grid) => (
            <Polygon
              key={grid}
              points={grid}
              fill="none"
              stroke={colors.border}
              strokeWidth={1}
            />
          ))}

          {chart.axes.map(({ label, end, text }) => (
            <G key={label}>
              <Line
                x1={center}
                y1={center}
                x2={end.x}
                y2={end.y}
                stroke={colors.borderStrong}
                strokeWidth={1}
              />
              <SvgText
                x={text.x}
                y={text.y}
                fill={colors.textSecondary}
                fontSize={10}
                fontWeight="600"
                textAnchor="middle"
                alignmentBaseline="middle"
              >
                {label}
              </SvgText>
            </G>
          ))}

          {chart.polygons.map((points, index) => (
            <Polygon
              key={profiles[index]?.player.id ?? index}
              points={points}
              fill={COMPARISON_PLAYER_COLORS[index]}
              fillOpacity={0.14}
              stroke={COMPARISON_PLAYER_COLORS[index]}
              strokeWidth={2}
            />
          ))}

          <Circle cx={center} cy={center} r={2.5} fill={colors.borderStrong} />
        </Svg>
      </View>
    </Card>
  );
});

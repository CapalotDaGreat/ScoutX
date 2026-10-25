import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { type HeatmapGrid } from '@/features/gps/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type GpsHeatmapProps = {
  heatmap: HeatmapGrid;
  title?: string;
};

const chartWidth = 320;
const chartHeight = 210;

function cellOpacity(intensity: number): number {
  return Math.max(0.15, Math.min(intensity, 1));
}

export function GpsHeatmap({ heatmap, title }: GpsHeatmapProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('gps');

  const cellSize = useMemo(() => {
    const width = chartWidth / Math.max(heatmap.cols, 1);
    const height = chartHeight / Math.max(heatmap.rows, 1);
    return { width, height };
  }, [heatmap.cols, heatmap.rows]);

  return (
    <View className="gap-3 border-t border-border py-3">
      <View>
        <Heading level={3}>{title ?? t('heatmap.title')}</Heading>
        <Text variant="body-sm" color="secondary" className="mt-1">
          {t('heatmap.subtitle')}
        </Text>
      </View>

      <View className="w-full overflow-hidden rounded-lg bg-background-secondary">
        {heatmap.cells.length === 0 ? (
          <Text variant="body-sm" color="secondary" className="py-10">
            {t('heatmap.empty')}
          </Text>
        ) : (
          <Svg
            width="100%"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            style={{ width: '100%', aspectRatio: chartWidth / chartHeight }}
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('heatmap.a11y', { count: heatmap.cells.length })}
          >
            {heatmap.cells.map((cell) => (
              <Rect
                key={`${cell.row}-${cell.col}`}
                x={cell.col * cellSize.width}
                y={cell.row * cellSize.height}
                width={cellSize.width - 1}
                height={cellSize.height - 1}
                rx={2}
                fill={colors.accent}
                fillOpacity={cellOpacity(cell.intensity)}
              />
            ))}
          </Svg>
        )}
      </View>
    </View>
  );
}

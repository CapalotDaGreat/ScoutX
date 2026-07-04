import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { type HeatmapGrid } from '@/features/gps/types';

export type GpsHeatmapProps = {
  heatmap: HeatmapGrid;
  title?: string;
};

const chartWidth = 320;
const chartHeight = 210;

function interpolateColor(intensity: number, accent: string): string {
  const alpha = Math.max(0.15, Math.min(intensity, 1));
  if (accent === '#16A34A') {
    return `rgba(22, 163, 74, ${alpha})`;
  }

  return `rgba(34, 197, 94, ${alpha})`;
}

export function GpsHeatmap({ heatmap, title = 'Movement Heatmap' }: GpsHeatmapProps) {
  const { colors } = useTheme();

  const cellSize = useMemo(() => {
    const width = chartWidth / Math.max(heatmap.cols, 1);
    const height = chartHeight / Math.max(heatmap.rows, 1);
    return { width, height };
  }, [heatmap.cols, heatmap.rows]);

  return (
    <Card variant="default" padding="lg" className="gap-4">
      <View>
        <Heading level={3}>{title}</Heading>
        <Text variant="body-sm" color="secondary" className="mt-1">
          Pre-computed grid ready for map overlays and future visualization.
        </Text>
      </View>

      <View className="items-center rounded-lg bg-background-secondary p-3 dark:bg-neutral-950">
        {heatmap.cells.length === 0 ? (
          <Text variant="body-sm" color="secondary" className="py-10">
            Heatmap will appear after GPS points are recorded.
          </Text>
        ) : (
          <Svg
            width={chartWidth}
            height={chartHeight}
            accessibilityLabel="GPS movement heatmap"
          >
            {heatmap.cells.map((cell) => (
              <Rect
                key={`${cell.row}-${cell.col}`}
                x={cell.col * cellSize.width}
                y={cell.row * cellSize.height}
                width={cellSize.width - 1}
                height={cellSize.height - 1}
                rx={2}
                fill={interpolateColor(cell.intensity, colors.accent)}
              />
            ))}
          </Svg>
        )}
      </View>
    </Card>
  );
}

import { useMemo } from 'react';
import Svg, { Polygon } from 'react-native-svg';
import { useTheme } from '@/theme';
import { type RadarStat } from '@/features/scout-discovery/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type MiniRadarChartProps = {
  stats: RadarStat[];
  size?: number;
};

export function MiniRadarChart({ stats, size = 72 }: MiniRadarChartProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('scout');
  const center = size / 2;
  const radius = size * 0.34;

  const points = useMemo(() => {
    const total = Math.max(stats.length, 1);
    return stats
      .map((stat, index) => {
        const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
        const distance = radius * Math.min(stat.value, 1);
        const x = center + Math.cos(angle) * distance;
        const y = center + Math.sin(angle) * distance;
        return `${x},${y}`;
      })
      .join(' ');
  }, [center, radius, stats]);

  return (
    <Svg
      width={size}
      height={size}
      accessibilityLabel={t('scout:a11y.radar')}
    >
      <Polygon
        points={points}
        fill={colors.accent}
        fillOpacity={0.25}
        stroke={colors.accent}
        strokeWidth={1.5}
      />
    </Svg>
  );
}

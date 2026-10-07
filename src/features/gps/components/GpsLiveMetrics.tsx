import { View } from 'react-native';
import { StatCard } from '@/components/primitives/StatCard';
import {
  formatDistance,
  formatDuration,
  formatSpeed,
} from '@/features/gps/services/gpsSessionCalculator';
import { type GpsSessionMetrics } from '@/features/gps/types';
import { useDistanceUnit } from '@/features/gps/hooks/useDistanceUnit';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type GpsLiveMetricsProps = {
  metrics: GpsSessionMetrics;
};

export function GpsLiveMetrics({ metrics }: GpsLiveMetricsProps) {
  const { t } = useAppTranslation('gps');
  const unit = useDistanceUnit();
  return (
    <View className="flex-row flex-wrap gap-3">
      <View className="min-w-[45%] flex-1">
        <StatCard label={t('distance')} value={formatDistance(metrics.distanceM, unit)} variant="elevated" />
      </View>
      <View className="min-w-[45%] flex-1">
        <StatCard label={t('avgSpeed')} value={formatSpeed(metrics.avgSpeedKmh, unit)} variant="elevated" />
      </View>
      <View className="min-w-[45%] flex-1">
        <StatCard label={t('maxSpeed')} value={formatSpeed(metrics.maxSpeedKmh, unit)} variant="elevated" />
      </View>
      <View className="min-w-[45%] flex-1">
        <StatCard
          label={t('duration')}
          value={formatDuration(metrics.durationSec)}
          variant="elevated"
        />
      </View>
    </View>
  );
}

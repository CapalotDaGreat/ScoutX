import { View } from 'react-native';
import { StatCard } from '@/components/primitives/StatCard';
import {
  formatDistance,
  formatDuration,
  formatSpeed,
} from '@/features/gps/services/gpsSessionCalculator';
import { type GpsSessionMetrics } from '@/features/gps/types';

export type GpsLiveMetricsProps = {
  metrics: GpsSessionMetrics;
};

export function GpsLiveMetrics({ metrics }: GpsLiveMetricsProps) {
  return (
    <View className="flex-row flex-wrap gap-3">
      <View className="min-w-[45%] flex-1">
        <StatCard label="Distance" value={formatDistance(metrics.distanceM)} variant="elevated" />
      </View>
      <View className="min-w-[45%] flex-1">
        <StatCard label="Avg Speed" value={formatSpeed(metrics.avgSpeedKmh)} variant="elevated" />
      </View>
      <View className="min-w-[45%] flex-1">
        <StatCard label="Max Speed" value={formatSpeed(metrics.maxSpeedKmh)} variant="elevated" />
      </View>
      <View className="min-w-[45%] flex-1">
        <StatCard
          label="Duration"
          value={formatDuration(metrics.durationSec)}
          variant="elevated"
        />
      </View>
    </View>
  );
}

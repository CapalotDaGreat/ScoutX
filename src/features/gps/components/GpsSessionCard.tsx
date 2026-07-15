import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Badge } from '@/components/primitives/Badge';
import { Text } from '@/components/primitives/Text';
import {
  formatDistance,
  formatDuration,
  formatSpeed,
} from '@/features/gps/services/gpsSessionCalculator';
import { type GpsSession } from '@/features/gps/types';

export type GpsSessionCardProps = {
  session: GpsSession;
};

function formatSessionDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoDate));
}

export function GpsSessionCard({ session }: GpsSessionCardProps) {
  return (
    <Card variant="outlined" padding="md" className="gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text weight="semibold">{session.matchLabel}</Text>
          <Text variant="caption" color="secondary" className="mt-1">
            {formatSessionDate(session.startedAt)}
          </Text>
        </View>
        <Badge label={`${session.metrics.sprintCount} sprints`} variant="accent" size="sm" />
      </View>

      <View className="flex-row flex-wrap gap-2">
        <Text variant="caption" className="rounded bg-background-secondary px-2 py-1">
          {formatDistance(session.metrics.distanceM)}
        </Text>
        <Text variant="caption" className="rounded bg-background-secondary px-2 py-1">
          Avg {formatSpeed(session.metrics.avgSpeedKmh)}
        </Text>
        <Text variant="caption" className="rounded bg-background-secondary px-2 py-1">
          Max {formatSpeed(session.metrics.maxSpeedKmh)}
        </Text>
        <Text variant="caption" className="rounded bg-background-secondary px-2 py-1">
          {formatDuration(session.metrics.durationSec)}
        </Text>
      </View>
    </Card>
  );
}

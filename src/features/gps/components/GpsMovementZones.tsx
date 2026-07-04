import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { ProgressBar } from '@/components/primitives/ProgressBar';
import { Text } from '@/components/primitives/Text';
import { type MovementZone } from '@/features/gps/types';

export type GpsMovementZonesProps = {
  zones: MovementZone[];
};

export function GpsMovementZones({ zones }: GpsMovementZonesProps) {
  return (
    <Card variant="default" padding="lg" className="gap-4">
      <View>
        <Heading level={3}>Movement Zones</Heading>
        <Text variant="body-sm" color="secondary" className="mt-1">
          Time spent across defensive, middle, and attacking thirds.
        </Text>
      </View>

      <View className="gap-4">
        {zones.map((zone) => (
          <View key={zone.zone} className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text weight="semibold">{zone.label}</Text>
              <Text variant="caption" color="secondary">
                {zone.percentage}% · {zone.durationSec}s
              </Text>
            </View>
            <ProgressBar value={zone.percentage} max={100} size="md" variant="accent" />
          </View>
        ))}
      </View>
    </Card>
  );
}

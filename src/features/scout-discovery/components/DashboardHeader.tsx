import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';

export type DashboardHeaderProps = {
  scoutName: string;
  matchingCount: number;
  savedCount: number;
  recentlyViewedCount: number;
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 18) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

export function DashboardHeader({
  scoutName,
  matchingCount,
  savedCount,
  recentlyViewedCount,
}: DashboardHeaderProps) {
  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text variant="overline" color="secondary" className="uppercase">
          Scout Command Center
        </Text>
        <Heading level={1}>
          {getGreeting()}, {scoutName}
        </Heading>
        <Text variant="body-sm" color="secondary">
          {matchingCount} players match your preferences today.
        </Text>
      </View>

      <View className="flex-row gap-3">
        <Card variant="outlined" padding="sm" className="flex-1">
          <Text variant="caption" color="secondary">
            Matching
          </Text>
          <Text variant="body-sm" weight="semibold">
            {matchingCount}
          </Text>
        </Card>
        <Card variant="outlined" padding="sm" className="flex-1">
          <Text variant="caption" color="secondary">
            Saved
          </Text>
          <Text variant="body-sm" weight="semibold">
            {savedCount}
          </Text>
        </Card>
        <Card variant="outlined" padding="sm" className="flex-1">
          <Text variant="caption" color="secondary">
            Recent
          </Text>
          <Text variant="body-sm" weight="semibold">
            {recentlyViewedCount}
          </Text>
        </Card>
      </View>
    </View>
  );
}

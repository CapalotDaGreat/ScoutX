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
    <View className="gap-5">
      <View className="gap-1.5">
        <Text variant="overline" color="secondary" className="uppercase tracking-widest">
          Scout workspace
        </Text>
        <Heading level={1}>
          {getGreeting()}, {scoutName}
        </Heading>
        <Text variant="body-sm" color="secondary" className="mt-0.5">
          {matchingCount} players match your preferences today.
        </Text>
      </View>

      <View className="flex-row gap-3">
        <Card variant="elevated" padding="sm" className="flex-1">
          <Text variant="caption" color="secondary" className="uppercase tracking-wider">
            Matching
          </Text>
          <Text className="mt-1 font-sans-bold text-stat-lg text-foreground">
            {matchingCount}
          </Text>
        </Card>
        <Card variant="elevated" padding="sm" className="flex-1">
          <Text variant="caption" color="secondary" className="uppercase tracking-wider">
            Pipeline
          </Text>
          <Text className="mt-1 font-sans-bold text-stat-lg text-foreground">
            {savedCount}
          </Text>
        </Card>
        <Card variant="elevated" padding="sm" className="flex-1">
          <Text variant="caption" color="secondary" className="uppercase tracking-wider">
            Recent
          </Text>
          <Text className="mt-1 font-sans-bold text-stat-lg text-foreground">
            {recentlyViewedCount}
          </Text>
        </Card>
      </View>
    </View>
  );
}

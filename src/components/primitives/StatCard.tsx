import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { cn } from '@/utils/cn';

export type StatCardProps = {
  label: string;
  value: string | number;
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
  };
  icon?: React.ReactNode;
  variant?: 'default' | 'elevated' | 'outlined';
  className?: string;
  testID?: string;
};

const trendColors = {
  up: 'text-success',
  down: 'text-error',
  neutral: 'text-foreground-secondary',
} as const;

export function StatCard({
  label,
  value,
  trend,
  icon,
  variant = 'default',
  className,
  testID,
}: StatCardProps) {
  return (
    <Card
      variant={variant}
      padding="sm"
      className={cn('min-w-[100px] flex-1', className)}
      testID={testID}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text variant="caption" color="secondary" className="mb-1 uppercase tracking-wider">
            {label}
          </Text>
          <Text className="font-sans-bold text-stat-lg text-foreground">
            {value}
          </Text>
          {trend ? (
            <Text
              variant="caption"
              className={cn('mt-1 font-sans-medium', trendColors[trend.direction])}
            >
              {trend.value}
            </Text>
          ) : null}
        </View>
        {icon ? <View className="ml-2">{icon}</View> : null}
      </View>
    </Card>
  );
}

import { type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { cn } from '@/utils/cn';

export type DashboardSectionProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  children: ReactNode;
  className?: string;
};

export function DashboardSection({
  title,
  subtitle,
  actionLabel,
  onActionPress,
  children,
  className,
}: DashboardSectionProps) {
  return (
    <View className={cn('gap-3', className)}>
      <View className="flex-row items-end justify-between gap-3">
        <View className="flex-1">
          <Heading level={3}>{title}</Heading>
          {subtitle ? (
            <Text variant="body-sm" color="secondary" className="mt-1">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {actionLabel && onActionPress ? (
          <Button variant="link" size="sm" onPress={onActionPress}>
            {actionLabel}
          </Button>
        ) : null}
      </View>
      {children}
    </View>
  );
}

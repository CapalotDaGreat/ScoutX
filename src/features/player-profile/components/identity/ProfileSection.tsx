import { type ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { cn } from '@/utils/cn';

export type ProfileSectionProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'outlined';
};

export function ProfileSection({
  title,
  subtitle,
  action,
  children,
  className,
  variant = 'default',
}: ProfileSectionProps) {
  return (
    <Card variant={variant === 'outlined' ? 'outlined' : 'default'} padding="lg" className={cn('gap-4', className)}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Heading level={3}>{title}</Heading>
          {subtitle ? (
            <Text variant="body-sm" color="secondary" className="mt-1">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {action}
      </View>
      {children}
    </Card>
  );
}

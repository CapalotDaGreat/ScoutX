import { type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { cn } from '@/utils/cn';

export type AuthCardProps = ViewProps & {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
};

export function AuthCard({ title, subtitle, children, className, ...props }: AuthCardProps) {
  return (
    <Card variant="elevated" padding="lg" className={cn('w-full', className)} {...props}>
      <View className="gap-2">
        <Heading level={2}>{title}</Heading>
        {subtitle ? (
          <Text variant="body-sm" color="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View className="mt-6 gap-4">{children}</View>
    </Card>
  );
}

import { type ReactNode } from 'react';
import { View } from 'react-native';
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
    <View className={cn('gap-4 border-t border-border py-4', variant === 'outlined' && 'border-b', className)}>
      <View className="flex-row flex-wrap items-start justify-between gap-3">
        <View className="min-w-[60%] flex-1">
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
    </View>
  );
}

import { type ReactNode } from 'react';
import { View } from 'react-native';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { Button } from '@/components/primitives/Button';
import { cn } from '@/utils/cn';

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <View
      accessibilityRole="summary"
      className={cn(
        'flex-1 items-center justify-center px-6 py-12',
        className,
      )}
    >
      {icon ? <View className="mb-6" importantForAccessibility="no-hide-descendants">{icon}</View> : null}

      <Heading level={2} className="text-center">
        {title}
      </Heading>

      {description ? (
        <Text
          variant="body"
          color="secondary"
          className="mt-2 max-w-[280px] text-center"
        >
          {description}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <Button variant="accent" className="mt-8 min-w-[160px]" onPress={onAction}>
          {actionLabel}
        </Button>
      ) : null}

      {secondaryActionLabel && onSecondaryAction ? (
        <Button variant="ghost" className="mt-3" onPress={onSecondaryAction}>
          {secondaryActionLabel}
        </Button>
      ) : null}
    </View>
  );
}

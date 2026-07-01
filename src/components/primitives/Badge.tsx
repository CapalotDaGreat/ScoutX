import { View, type ViewProps } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { cn } from '@/utils/cn';

const variantStyles = {
  default: 'bg-background-secondary dark:bg-neutral-800',
  accent: 'bg-accent-muted dark:bg-green-950',
  success: 'bg-success-muted dark:bg-green-950',
  warning: 'bg-warning-muted dark:bg-yellow-950',
  error: 'bg-error-muted dark:bg-red-950',
  info: 'bg-info-muted dark:bg-blue-950',
  outline: 'bg-transparent border border-border dark:border-neutral-700',
} as const;

const textVariantStyles = {
  default: 'text-foreground-secondary dark:text-neutral-300',
  accent: 'text-accent dark:text-green-400',
  success: 'text-success dark:text-green-400',
  warning: 'text-warning dark:text-yellow-400',
  error: 'text-error dark:text-red-400',
  info: 'text-info dark:text-blue-400',
  outline: 'text-foreground-secondary dark:text-neutral-300',
} as const;

const sizeStyles = {
  sm: 'px-2 py-0.5 rounded-sm',
  md: 'px-2.5 py-1 rounded-sm',
  lg: 'px-3 py-1.5 rounded-md',
} as const;

export type BadgeVariant = keyof typeof variantStyles;
export type BadgeSize = keyof typeof sizeStyles;

export type BadgeProps = ViewProps & {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
};

export function Badge({
  label,
  variant = 'default',
  size = 'md',
  className,
  ...props
}: BadgeProps) {
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      className={cn(
        'self-start',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      <Text
        variant="caption"
        className={cn('font-sans-semibold', textVariantStyles[variant])}
      >
        {label}
      </Text>
    </View>
  );
}

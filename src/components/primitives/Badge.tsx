import { View, type ViewProps } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { cn } from '@/utils/cn';

const variantStyles = {
  default: 'bg-background-secondary',
  accent: 'bg-accent-muted',
  success: 'bg-success-muted',
  warning: 'bg-warning-muted',
  error: 'bg-error-muted',
  info: 'bg-info-muted',
  outline: 'bg-transparent border border-border',
} as const;

const textVariantStyles = {
  default: 'text-foreground-secondary',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  info: 'text-info',
  outline: 'text-foreground-secondary',
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

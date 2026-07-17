import { View, type ViewProps } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';

const variantStyles = {
  default: 'bg-background-secondary',
  accent: 'bg-accent-muted',
  prestige: 'bg-gold-muted border border-gold/35',
  success: 'bg-success-muted',
  warning: 'bg-warning-muted',
  error: 'bg-error-muted',
  info: 'bg-info-muted',
  outline: 'bg-transparent border border-gold/30',
} as const;

const sizeStyles = {
  sm: 'px-2.5 py-1 rounded-lg',
  md: 'px-3 py-1.5 rounded-lg',
  lg: 'px-3.5 py-2 rounded-xl',
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
  style,
  ...props
}: BadgeProps) {
  const { colors } = useTheme();

  const backgroundColor =
    variant === 'default'
      ? colors.backgroundSecondary
      : variant === 'accent'
        ? colors.accentMuted
        : variant === 'prestige'
          ? colors.goldMuted
          : variant === 'success'
            ? colors.successMuted
            : variant === 'warning'
              ? colors.warningMuted
              : variant === 'error'
                ? colors.errorMuted
                : variant === 'info'
                  ? colors.infoMuted
                  : undefined;

  const labelColor =
    variant === 'default'
      ? 'secondary'
      : variant === 'accent'
        ? 'accent'
        : variant === 'prestige' || variant === 'outline'
          ? 'prestige'
          : variant === 'success'
            ? 'success'
            : variant === 'warning'
              ? 'warning'
              : variant === 'error'
                ? 'error'
                : 'info';

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
      style={[{ backgroundColor }, style]}
      {...props}
    >
      <Text variant="caption" weight="semibold" color={labelColor}>
        {label}
      </Text>
    </View>
  );
}

import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { triggerHaptic } from '@/utils/haptics';

const variantStyles = {
  primary: 'bg-primary border border-transparent active:opacity-90',
  accent: 'bg-accent border border-transparent active:opacity-90',
  secondary: 'bg-transparent border border-border active:opacity-80',
  ghost: 'bg-transparent border border-transparent active:opacity-70',
  destructive: 'bg-error-muted border border-transparent active:opacity-90',
  link: 'bg-transparent border border-transparent',
} as const;

const sizeStyles = {
  sm: 'h-9 px-3 rounded-md',
  md: 'h-11 px-4 rounded-md',
  lg: 'h-[52px] px-6 rounded-md',
} as const;

const textVariantStyles = {
  primary: 'text-primary-foreground',
  accent: 'text-accent-foreground',
  secondary: 'text-foreground',
  ghost: 'text-foreground-secondary',
  destructive: 'text-error',
  link: 'text-accent',
} as const;

const textSizeStyles = {
  sm: 'text-label',
  md: 'text-body',
  lg: 'text-body-lg',
} as const;

export type ButtonVariant = keyof typeof variantStyles;
export type ButtonSize = keyof typeof sizeStyles;

export type ButtonProps = Omit<PressableProps, 'children'> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
  textClassName?: string;
  haptic?: boolean;
};

export const Button = forwardRef<View, ButtonProps>(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    fullWidth = false,
    leftIcon,
    rightIcon,
    className,
    textClassName,
    haptic = true,
    onPress,
    accessibilityLabel,
    ...props
  },
  ref,
) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  const spinnerColor =
    variant === 'primary'
      ? colors.primaryForeground
      : variant === 'accent'
        ? colors.accentForeground
        : colors.textPrimary;

  const handlePress: PressableProps['onPress'] = (event) => {
    if (haptic && !isDisabled) {
      void triggerHaptic('light');
    }
    onPress?.(event);
  };

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={
        accessibilityLabel ?? (typeof children === 'string' ? children : undefined)
      }
      disabled={isDisabled}
      onPress={handlePress}
      className={cn(
        'flex-row items-center justify-center gap-2',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        isDisabled && 'opacity-40',
        className,
      )}
      style={({ pressed }) =>
        pressed && !isDisabled
          ? ({ transform: [{ scale: 0.97 }] } satisfies ViewStyle)
          : undefined
      }
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} size="small" />
      ) : (
        <>
          {leftIcon}
          {typeof children === 'string' ? (
            <Text
              className={cn(
                'font-sans-medium',
                textVariantStyles[variant],
                textSizeStyles[size],
                textClassName,
              )}
            >
              {children}
            </Text>
          ) : (
            children
          )}
          {rightIcon}
        </>
      )}
    </Pressable>
  );
});

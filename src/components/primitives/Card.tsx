import { forwardRef, type ReactNode } from 'react';
import { Pressable, View, type PressableProps, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { triggerHaptic } from '@/utils/haptics';

const variantStyles = {
  default: 'bg-surface border border-border',
  outlined: 'bg-surface border border-gold/20',
  elevated: 'bg-surface-elevated border border-gold/25',
  media: 'bg-surface border border-border overflow-hidden',
  glass: 'bg-foreground/8 border border-foreground/15 overflow-hidden',
  prestige: 'bg-gold-muted border border-gold/40',
} as const;

export type CardVariant = keyof typeof variantStyles;

export type CardProps = ViewProps & {
  children: ReactNode;
  variant?: CardVariant;
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
  onPress?: PressableProps['onPress'];
};

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
} as const;

export const Card = forwardRef<View, CardProps>(function Card(
  {
    children,
    variant = 'default',
    interactive = false,
    padding = 'md',
    className,
    onPress,
    ...props
  },
  ref,
) {
  const { colors, isDark } = useTheme();

  const surfaceColor =
    variant === 'elevated'
      ? colors.surfaceElevated
      : variant === 'prestige'
        ? colors.goldMuted
        : variant === 'glass'
          ? undefined
          : colors.surface;

  const content = (
    <View
      className={cn(
        'rounded-2xl',
        variantStyles[variant],
        paddingStyles[padding],
        className,
      )}
      style={[
        surfaceColor ? { backgroundColor: surfaceColor } : undefined,
        variant === 'elevated' || variant === 'prestige'
          ? {
              shadowColor: variant === 'prestige' ? colors.gold : colors.primary,
              shadowOpacity: isDark ? 0.22 : variant === 'prestige' ? 0.12 : 0.06,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 3,
            }
          : undefined,
      ]}
    >
      {children}
    </View>
  );

  if (!interactive && !onPress) {
    return (
      <View ref={ref} accessibilityRole="none" {...props}>
        {content}
      </View>
    );
  }

  const handlePress: PressableProps['onPress'] = (event) => {
    void triggerHaptic('light');
    onPress?.(event);
  };

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      onPress={handlePress}
      className="rounded-2xl"
      style={({ pressed }) =>
        pressed
          ? ({ transform: [{ scale: 0.985 }] } satisfies ViewStyle)
          : undefined
      }
      {...props}
    >
      {content}
    </Pressable>
  );
});

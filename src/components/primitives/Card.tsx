import { forwardRef, type ReactNode } from 'react';
import { Pressable, View, type PressableProps, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { triggerHaptic } from '@/utils/haptics';

const variantStyles = {
  default: 'bg-surface border border-divider',
  outlined: 'bg-surface border border-border',
  elevated: 'bg-surface-elevated border border-divider',
  media: 'bg-surface border border-divider overflow-hidden',
  glass: 'bg-surface border border-divider overflow-hidden',
  prestige: 'bg-gold-muted border border-divider',
  /** Quiet inset panel on the page background: no border, used inside sections. */
  tonal: 'bg-background-secondary',
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
  const { colors } = useTheme();

  const surfaceColor =
    variant === 'elevated'
      ? colors.surfaceElevated
      : variant === 'prestige'
        ? colors.goldMuted
        : variant === 'tonal'
          ? colors.backgroundSecondary
          : colors.surface;

  const content = (
    <View
      className={cn(
        'rounded-xl',
        variantStyles[variant],
        paddingStyles[padding],
        className,
      )}
      style={[
        surfaceColor ? { backgroundColor: surfaceColor } : undefined,
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
      className="rounded-xl"
      style={({ pressed }) =>
        pressed
          ? ({ opacity: 0.88 } satisfies ViewStyle)
          : undefined
      }
      {...props}
    >
      {content}
    </Pressable>
  );
});

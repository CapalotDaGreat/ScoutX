import { forwardRef, type ReactNode } from 'react';
import { Pressable, View, type PressableProps, type ViewProps, type ViewStyle } from 'react-native';
import { cn } from '@/utils/cn';
import { triggerHaptic } from '@/utils/haptics';

const variantStyles = {
  default:
    'bg-surface dark:bg-neutral-900 border border-border dark:border-neutral-800',
  outlined:
    'bg-surface dark:bg-neutral-900 border border-border dark:border-neutral-700',
  elevated:
    'bg-surface-elevated dark:bg-neutral-800 border border-border dark:border-neutral-700 shadow-sm',
  media: 'bg-surface dark:bg-neutral-900 border border-border dark:border-neutral-800 overflow-hidden',
  glass: 'bg-white/10 dark:bg-white/5 border border-white/20 overflow-hidden',
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
  md: 'p-6',
  lg: 'p-8',
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
  const content = (
    <View
      className={cn(
        'rounded-lg',
        variantStyles[variant],
        paddingStyles[padding],
        className,
      )}
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
      className="rounded-lg"
      style={({ pressed }) =>
        pressed
          ? ({ transform: [{ scale: 0.98 }] } satisfies ViewStyle)
          : undefined
      }
      {...props}
    >
      {content}
    </Pressable>
  );
});

import { forwardRef, type ReactNode } from 'react';
import { Pressable, View, type PressableProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { triggerHaptic } from '@/utils/haptics';

const sizeStyles = {
  sm: 'h-12 w-12',
  md: 'h-14 w-14',
  lg: 'h-16 w-16',
} as const;

const positionStyles = {
  'bottom-right': 'right-4',
  'bottom-left': 'left-4',
  'bottom-center': 'self-center',
} as const;

export type FabSize = keyof typeof sizeStyles;
export type FabPosition = keyof typeof positionStyles;

export type FloatingActionButtonProps = Omit<PressableProps, 'children'> & {
  icon: ReactNode;
  label?: string;
  size?: FabSize;
  position?: FabPosition;
  variant?: 'accent' | 'primary';
  extended?: boolean;
  bottomOffset?: number;
  className?: string;
};

export const FloatingActionButton = forwardRef<View, FloatingActionButtonProps>(
  function FloatingActionButton(
    {
      icon,
      label,
      size = 'md',
      position = 'bottom-right',
      variant = 'accent',
      extended = false,
      bottomOffset,
      disabled = false,
      className,
      onPress,
      accessibilityLabel,
      ...props
    },
    ref,
  ) {
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const bottom = bottomOffset ?? insets.bottom + 16;

    const backgroundColor = variant === 'accent' ? colors.accent : colors.primary;
    const foregroundColor =
      variant === 'accent' ? colors.accentForeground : colors.primaryForeground;

    const handlePress: PressableProps['onPress'] = (event) => {
      if (!disabled) {
        void triggerHaptic('medium');
      }
      onPress?.(event);
    };

    return (
      <View
        pointerEvents="box-none"
        className={cn('absolute', positionStyles[position])}
        style={{ bottom }}
      >
        <Pressable
          ref={ref}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? label ?? 'Floating action'}
          accessibilityState={{ disabled: Boolean(disabled) }}
          disabled={disabled}
          onPress={handlePress}
          className={cn(
            'flex-row items-center justify-center rounded-full shadow-md',
            extended ? 'px-5' : sizeStyles[size],
            disabled && 'opacity-40',
            className,
          )}
          style={({ pressed }) => [
            {
              backgroundColor,
              shadowColor: isDark ? '#000' : colors.accent,
              shadowOpacity: isDark ? 0.3 : 0.25,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            },
            extended ? { height: 56, gap: 8 } : undefined,
            pressed && !disabled
              ? ({ transform: [{ scale: 0.95 }] } satisfies ViewStyle)
              : undefined,
          ]}
          {...props}
        >
          {icon}
          {extended && label ? (
            <Text
              variant="label"
              className="font-sans-semibold"
              style={{ color: foregroundColor }}
            >
              {label}
            </Text>
          ) : null}
        </Pressable>
      </View>
    );
  },
);

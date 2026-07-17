import { View, type ViewProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { Text } from '@/components/primitives/Text';
import { resolveProgressAccentColor, useTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { motion } from '@/theme/tokens/motion';

export type ProgressBarProps = ViewProps & {
  value: number;
  max?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** `progress` uses stone→info→emerald→gold by percentage */
  variant?: 'accent' | 'primary' | 'success' | 'gold' | 'progress';
  className?: string;
  accessibilityLabel?: string;
};

const sizeStyles = {
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-2.5',
} as const;

export function ProgressBar({
  value,
  max = 100,
  showLabel = false,
  size = 'md',
  variant = 'accent',
  className,
  accessibilityLabel,
  ...props
}: ProgressBarProps) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);
  const clampedValue = Math.min(Math.max(value, 0), max);
  const percentage = max === 0 ? 0 : (clampedValue / max) * 100;

  useEffect(() => {
    progress.value = withTiming(percentage, { duration: motion.normal });
  }, [percentage, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  const fillColor =
    variant === 'progress'
      ? resolveProgressAccentColor(colors, percentage)
      : variant === 'gold'
        ? colors.gold
        : variant === 'accent'
          ? colors.accent
          : variant === 'success'
            ? colors.success
            : colors.primary;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? `Progress ${Math.round(percentage)} percent`}
      accessibilityValue={{
        min: 0,
        max,
        now: clampedValue,
        text: `${Math.round(percentage)}%`,
      }}
      className={cn('w-full', className)}
      {...props}
    >
      <View
        className={cn(
          'w-full overflow-hidden rounded-full bg-background-secondary',
          sizeStyles[size],
        )}
      >
        <Animated.View
          className="h-full rounded-full"
          style={[fillStyle, { backgroundColor: fillColor }]}
        />
      </View>
      {showLabel ? (
        <Text variant="caption" color="secondary" className="mt-1">
          {Math.round(percentage)}%
        </Text>
      ) : null}
    </View>
  );
}

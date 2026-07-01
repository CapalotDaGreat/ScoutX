import { useEffect, type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';

export type SkeletonProps = ViewProps & {
  width?: number | `${number}%`;
  height?: number;
  radius?: 'sm' | 'md' | 'lg' | 'full' | 'none';
  animate?: boolean;
  className?: string;
};

const radiusStyles = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
} as const;

function ShimmerOverlay({ animate }: { animate: boolean }) {
  const { colors } = useTheme();
  const translateX = useSharedValue(-120);

  useEffect(() => {
    if (!animate) {
      return;
    }
    translateX.value = withRepeat(
      withTiming(240, { duration: 1200, easing: Easing.linear }),
      -1,
      false,
    );
  }, [animate, translateX]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (!animate) {
    return null;
  }

  return (
    <Animated.View
      style={shimmerStyle}
      className="absolute inset-0 w-1/2 opacity-60"
    >
      <View
        className="h-full w-full"
        style={{ backgroundColor: colors.skeletonHighlight }}
      />
    </Animated.View>
  );
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 'md',
  animate = true,
  className,
  style,
  ...props
}: SkeletonProps) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading content"
      className={cn('overflow-hidden', radiusStyles[radius], className)}
      style={[{ width, height, backgroundColor: colors.skeletonBase }, style]}
      {...props}
    >
      <ShimmerOverlay animate={animate} />
    </View>
  );
}

export type SkeletonTextProps = {
  lines?: number;
  lastLineWidth?: `${number}%`;
  className?: string;
};

export function SkeletonText({
  lines = 3,
  lastLineWidth = '60%',
  className,
}: SkeletonTextProps) {
  return (
    <View className={cn('gap-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height={14}
          width={index === lines - 1 ? lastLineWidth : '100%'}
          radius="sm"
        />
      ))}
    </View>
  );
}

export type SkeletonAvatarProps = {
  size?: number;
  className?: string;
};

export function SkeletonAvatar({ size = 48, className }: SkeletonAvatarProps) {
  return (
    <Skeleton
      width={size}
      height={size}
      radius="full"
      className={className}
    />
  );
}

export type SkeletonCardProps = {
  height?: number;
  className?: string;
};

export function SkeletonCard({ height = 88, className }: SkeletonCardProps) {
  return <Skeleton height={height} radius="lg" className={className} />;
}

export type SkeletonLoaderProps = {
  variant?: 'profile' | 'list' | 'card' | 'custom';
  count?: number;
  children?: ReactNode;
  className?: string;
};

export function SkeletonLoader({
  variant = 'list',
  count = 4,
  children,
  className,
}: SkeletonLoaderProps) {
  if (variant === 'custom' && children) {
    return <View className={className}>{children}</View>;
  }

  if (variant === 'profile') {
    return (
      <View className={cn('gap-6', className)}>
        <Skeleton height={160} radius="lg" />
        <View className="flex-row items-center gap-4">
          <SkeletonAvatar size={64} />
          <View className="flex-1 gap-2">
            <Skeleton height={20} width="70%" />
            <Skeleton height={14} width="50%" />
          </View>
        </View>
        <View className="flex-row gap-3">
          <Skeleton height={48} className="flex-1" radius="md" />
          <Skeleton height={48} className="flex-1" radius="md" />
          <Skeleton height={48} className="flex-1" radius="md" />
          <Skeleton height={48} className="flex-1" radius="md" />
        </View>
        <SkeletonText lines={4} />
      </View>
    );
  }

  if (variant === 'card') {
    return (
      <View className={cn('gap-3', className)}>
        {Array.from({ length: count }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </View>
    );
  }

  return (
    <View className={cn('gap-3', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} className="flex-row items-center gap-3">
          <SkeletonAvatar />
          <View className="flex-1 gap-2">
            <Skeleton height={14} width="80%" />
            <Skeleton height={12} width="50%" />
          </View>
        </View>
      ))}
    </View>
  );
}

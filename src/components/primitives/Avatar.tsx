import { Image, View, type ImageSourcePropType } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';

const sizeStyles = {
  xs: 'h-8 w-8',
  sm: 'h-10 w-10',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
  xl: 'h-20 w-20',
  '2xl': 'h-24 w-24',
} as const;

const textSizeStyles = {
  xs: 'text-caption',
  sm: 'text-label',
  md: 'text-body',
  lg: 'text-heading-3',
  xl: 'text-heading-2',
  '2xl': 'text-heading-1',
} as const;

export type AvatarSize = keyof typeof sizeStyles;

export type AvatarProps = {
  source?: ImageSourcePropType;
  name?: string;
  size?: AvatarSize;
  showBorder?: boolean;
  className?: string;
  testID?: string;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function Avatar({
  source,
  name = '',
  size = 'md',
  showBorder = false,
  className,
  testID,
}: AvatarProps) {
  const { colors } = useTheme();
  const initials = getInitials(name);
  const label = name ? `${name} avatar` : 'User avatar';

  return (
    <View
      testID={testID}
      accessibilityLabel={label}
      accessibilityRole="image"
      className={cn(
        'items-center justify-center overflow-hidden rounded-full bg-background-secondary dark:bg-neutral-800',
        sizeStyles[size],
        showBorder && 'border-2 border-surface dark:border-neutral-900',
        className,
      )}
    >
      {source ? (
        <Image
          source={source}
          className="h-full w-full"
          resizeMode="cover"
          accessibilityLabel={label}
        />
      ) : (
        <Text
          className={cn('font-sans-semibold text-foreground-secondary', textSizeStyles[size])}
          style={{ color: colors.textSecondary }}
        >
          {initials}
        </Text>
      )}
    </View>
  );
}

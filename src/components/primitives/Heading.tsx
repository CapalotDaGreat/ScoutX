import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';

const levelStyles = {
  'display-xl': 'text-display-xl font-sans-bold',
  'display-lg': 'text-display-lg font-sans-bold',
  1: 'text-heading-1 font-sans-semibold',
  2: 'text-heading-2 font-sans-semibold',
  3: 'text-heading-3 font-sans-semibold',
} as const;

export type HeadingLevel = keyof typeof levelStyles;

export type HeadingProps = RNTextProps & {
  level?: HeadingLevel;
  className?: string;
};

/**
 * Theme-aware heading. Uses explicit theme color so dark mode stays readable
 * when NativeWind CSS variables do not resolve.
 */
export function Heading({
  level = 2,
  className,
  style,
  accessibilityRole = 'header',
  ...props
}: HeadingProps) {
  const { colors } = useTheme();

  return (
    <RNText
      accessibilityRole={accessibilityRole}
      className={cn(levelStyles[level], className)}
      style={[{ color: colors.textPrimary, letterSpacing: 0 } satisfies TextStyle, style]}
      {...props}
    />
  );
}

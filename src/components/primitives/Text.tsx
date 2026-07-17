import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme } from '@/theme';
import { type ThemeColors } from '@/theme/tokens/colors';
import { cn } from '@/utils/cn';

const variantStyles = {
  'body-lg': 'text-body-lg font-sans',
  body: 'text-body font-sans',
  'body-sm': 'text-body-sm font-sans',
  label: 'text-label font-sans-medium',
  caption: 'text-caption font-sans-medium',
  overline: 'text-overline font-sans-medium uppercase',
  link: 'text-body font-sans',
  inverse: 'text-body font-sans',
} as const;

const weightStyles = {
  regular: 'font-sans',
  medium: 'font-sans-medium',
  semibold: 'font-sans-semibold',
  bold: 'font-sans-bold',
} as const;

const colorStyles = {
  primary: 'text-foreground',
  secondary: 'text-foreground-secondary',
  tertiary: 'text-foreground-tertiary',
  accent: 'text-accent',
  prestige: 'text-gold',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  info: 'text-info',
  inverse: 'text-foreground-inverse',
  onPrimary: 'text-primary-foreground',
  onAccent: 'text-accent-foreground',
  onGold: 'text-gold-foreground',
  link: 'text-accent',
} as const;

/** Maps NativeWind text-* utilities to theme tokens (last match wins). */
const classNameColorMap: Record<string, keyof ThemeColors> = {
  'text-foreground': 'textPrimary',
  'text-foreground-secondary': 'textSecondary',
  'text-foreground-tertiary': 'textTertiary',
  'text-foreground-inverse': 'textInverse',
  'text-primary': 'primary',
  'text-primary-foreground': 'primaryForeground',
  'text-accent': 'accent',
  'text-accent-foreground': 'accentForeground',
  'text-gold': 'gold',
  'text-gold-foreground': 'goldForeground',
  'text-success': 'success',
  'text-warning': 'warning',
  'text-error': 'error',
  'text-info': 'info',
};

export type TextVariant = keyof typeof variantStyles;
export type TextWeight = keyof typeof weightStyles;
export type TextColor = keyof typeof colorStyles;

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  weight?: TextWeight;
  color?: TextColor;
  className?: string;
};

function resolveColorFromClassName(
  className: string | undefined,
  colors: ThemeColors,
): string | undefined {
  if (!className) {
    return undefined;
  }
  const tokens = className.split(/\s+/);
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const key = classNameColorMap[tokens[i]];
    if (key) {
      return colors[key];
    }
  }
  return undefined;
}

function resolveThemeColor(
  variant: TextVariant,
  color: TextColor | undefined,
  className: string | undefined,
  colors: ThemeColors,
): string {
  if (color) {
    switch (color) {
      case 'primary':
        return colors.textPrimary;
      case 'secondary':
        return colors.textSecondary;
      case 'tertiary':
        return colors.textTertiary;
      case 'accent':
        return colors.accent;
      case 'prestige':
        return colors.gold;
      case 'success':
        return colors.success;
      case 'warning':
        return colors.warning;
      case 'error':
        return colors.error;
      case 'info':
        return colors.info;
      case 'inverse':
        return colors.textInverse;
      case 'onPrimary':
        return colors.primaryForeground;
      case 'onAccent':
        return colors.accentForeground;
      case 'onGold':
        return colors.goldForeground;
      case 'link':
        return colors.textLink;
      default:
        return colors.textPrimary;
    }
  }

  const fromClass = resolveColorFromClassName(className, colors);
  if (fromClass) {
    return fromClass;
  }

  switch (variant) {
    case 'body-sm':
    case 'caption':
    case 'overline':
      return colors.textSecondary;
    case 'link':
      return colors.textLink;
    case 'inverse':
      return colors.textInverse;
    default:
      return colors.textPrimary;
  }
}

/**
 * Theme-aware text. Color is applied via `style` from `useTheme()` so it stays
 * readable when NativeWind CSS variables fail (e.g. RN Modal portals).
 */
export function Text({
  variant = 'body',
  weight,
  color,
  className,
  style,
  accessibilityRole,
  ...props
}: TextProps) {
  const { colors } = useTheme();
  const resolvedColor = resolveThemeColor(variant, color, className, colors);

  return (
    <RNText
      accessibilityRole={accessibilityRole ?? 'text'}
      className={cn(
        variantStyles[variant],
        weight && weightStyles[weight],
        color && colorStyles[color],
        className,
      )}
      style={[{ color: resolvedColor } satisfies TextStyle, style]}
      {...props}
    />
  );
}

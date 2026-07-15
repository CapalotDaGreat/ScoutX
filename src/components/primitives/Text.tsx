import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { cn } from '@/utils/cn';

const variantStyles = {
  'body-lg': 'text-body-lg font-sans text-foreground',
  body: 'text-body font-sans text-foreground',
  'body-sm': 'text-body-sm font-sans text-foreground-secondary',
  label: 'text-label font-sans-medium text-foreground',
  caption: 'text-caption font-sans-medium text-foreground-secondary',
  overline: 'text-overline font-sans-semibold uppercase text-foreground-secondary',
  link: 'text-body font-sans text-accent',
  inverse: 'text-body font-sans text-foreground-inverse',
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
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  inverse: 'text-foreground-inverse',
} as const;

export type TextVariant = keyof typeof variantStyles;
export type TextWeight = keyof typeof weightStyles;
export type TextColor = keyof typeof colorStyles;

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  weight?: TextWeight;
  color?: TextColor;
  className?: string;
};

export function Text({
  variant = 'body',
  weight,
  color,
  className,
  accessibilityRole,
  ...props
}: TextProps) {
  return (
    <RNText
      accessibilityRole={accessibilityRole ?? 'text'}
      className={cn(
        variantStyles[variant],
        weight && weightStyles[weight],
        color && colorStyles[color],
        className,
      )}
      {...props}
    />
  );
}

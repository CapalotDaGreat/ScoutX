import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { cn } from '@/utils/cn';

const variantStyles = {
  'body-lg': 'text-body-lg font-sans text-foreground dark:text-white',
  body: 'text-body font-sans text-foreground dark:text-white',
  'body-sm': 'text-body-sm font-sans text-foreground-secondary dark:text-neutral-400',
  label: 'text-label font-sans-medium text-foreground dark:text-white',
  caption: 'text-caption font-sans-medium text-foreground-secondary dark:text-neutral-400',
  overline: 'text-overline font-sans-semibold uppercase text-foreground-secondary dark:text-neutral-400',
  link: 'text-body font-sans text-accent dark:text-green-400',
  inverse: 'text-body font-sans text-foreground-inverse dark:text-neutral-900',
} as const;

const weightStyles = {
  regular: 'font-sans',
  medium: 'font-sans-medium',
  semibold: 'font-sans-semibold',
  bold: 'font-sans-bold',
} as const;

const colorStyles = {
  primary: 'text-foreground dark:text-white',
  secondary: 'text-foreground-secondary dark:text-neutral-400',
  tertiary: 'text-foreground-tertiary dark:text-neutral-500',
  accent: 'text-accent dark:text-green-400',
  success: 'text-success dark:text-green-400',
  warning: 'text-warning dark:text-yellow-400',
  error: 'text-error dark:text-red-400',
  inverse: 'text-foreground-inverse dark:text-neutral-900',
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

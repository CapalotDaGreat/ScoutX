import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { cn } from '@/utils/cn';

const levelStyles = {
  'display-xl': 'text-display-xl font-sans-bold text-foreground',
  'display-lg': 'text-display-lg font-sans-bold text-foreground',
  1: 'text-heading-1 font-sans-semibold text-foreground',
  2: 'text-heading-2 font-sans-semibold text-foreground',
  3: 'text-heading-3 font-sans-semibold text-foreground',
} as const;

export type HeadingLevel = keyof typeof levelStyles;

export type HeadingProps = RNTextProps & {
  level?: HeadingLevel;
  className?: string;
};

export function Heading({
  level = 2,
  className,
  accessibilityRole = 'header',
  ...props
}: HeadingProps) {
  return (
    <RNText
      accessibilityRole={accessibilityRole}
      className={cn(levelStyles[level], className)}
      {...props}
    />
  );
}

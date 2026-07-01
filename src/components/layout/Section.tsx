import { type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { Heading, type HeadingLevel } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { cn } from '@/utils/cn';

export type SectionProps = ViewProps & {
  title?: string;
  subtitle?: string;
  headingLevel?: HeadingLevel;
  action?: ReactNode;
  children: ReactNode;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
};

const gapStyles = {
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
} as const;

export function Section({
  title,
  subtitle,
  headingLevel = 3,
  action,
  children,
  gap = 'md',
  className,
  ...props
}: SectionProps) {
  return (
    <View className={cn('w-full', className)} {...props}>
      {title || action ? (
        <View className="mb-4 flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            {title ? <Heading level={headingLevel}>{title}</Heading> : null}
            {subtitle ? (
              <Text variant="body-sm" color="secondary" className="mt-1">
                {subtitle}
              </Text>
            ) : null}
          </View>
          {action}
        </View>
      ) : null}

      <View className={cn('w-full', gapStyles[gap])}>{children}</View>
    </View>
  );
}

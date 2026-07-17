import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { type FormResult } from '@/features/scout-discovery/types';
import { cn } from '@/utils/cn';

export type PlayerFormStripProps = {
  form: FormResult[];
  size?: 'sm' | 'md';
  className?: string;
};

const sizeStyles = {
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
} as const;

export function PlayerFormStrip({ form, size = 'sm', className }: PlayerFormStripProps) {
  return (
    <View
      className={cn('flex-row gap-1', className)}
      accessibilityLabel="Recent form"
    >
      {form.slice(0, 5).map((result, index) => (
        <View
          key={`${result}-${index}`}
          className={cn(
            sizeStyles[size],
            'items-center justify-center rounded-sm',
            result === 'W' && 'bg-success-muted',
            result === 'D' && 'bg-background-secondary',
            result === 'L' && 'bg-error-muted',
          )}
        >
          <Text variant="caption" className="font-sans-bold">
            {result}
          </Text>
        </View>
      ))}
    </View>
  );
}

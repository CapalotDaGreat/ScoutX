import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { cn } from '@/utils/cn';

export type RatingPillProps = {
  label: string;
  value: string | number;
  emphasis?: 'primary' | 'secondary';
  className?: string;
};

export function RatingPill({ label, value, emphasis = 'secondary', className }: RatingPillProps) {
  return (
    <View
      className={cn(
        'rounded-lg px-3 py-2',
        emphasis === 'primary'
          ? 'bg-accent-muted dark:bg-green-950'
          : 'bg-background-secondary dark:bg-neutral-950',
        className,
      )}
    >
      <Text variant="caption" color="secondary">
        {label}
      </Text>
      <Text
        variant="body-sm"
        className={cn(
          'font-sans-bold',
          emphasis === 'primary' ? 'text-accent dark:text-green-400' : undefined,
        )}
      >
        {value}
      </Text>
    </View>
  );
}

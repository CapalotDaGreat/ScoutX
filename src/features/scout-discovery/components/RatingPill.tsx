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
        'rounded-xl px-3 py-2.5',
        emphasis === 'primary' ? 'bg-accent-muted' : 'bg-background-secondary',
        className,
      )}
    >
      <Text variant="caption" color="secondary">
        {label}
      </Text>
      <Text
        className={cn(
          'mt-0.5',
          // Numbers and short codes read as scoreboard figures; words stay in the text face and may wrap.
          String(value).length <= 5 ? 'font-display text-stat-lg' : 'font-sans-semibold text-body',
          emphasis === 'primary' ? 'text-accent' : 'text-foreground',
        )}
      >
        {value}
      </Text>
    </View>
  );
}

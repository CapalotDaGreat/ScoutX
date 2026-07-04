import { Pressable, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { Text } from '@/components/primitives/Text';
import { RATING_MAX, RATING_MIN } from '@/features/scouting-reports/constants';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';

export type ReportRatingFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  emphasis?: boolean;
  className?: string;
};

export function ReportRatingField({
  label,
  value,
  onChange,
  emphasis = false,
  className,
}: ReportRatingFieldProps) {
  const { colors } = useTheme();

  const decrement = () => onChange(Math.max(RATING_MIN, value - 1));
  const increment = () => onChange(Math.min(RATING_MAX, value + 1));

  return (
    <View
      className={cn(
        'rounded-xl border border-border p-3 dark:border-neutral-800',
        emphasis ? 'bg-accent-muted/40 dark:bg-green-950/30' : 'bg-background-secondary/50 dark:bg-neutral-900/50',
        className,
      )}
    >
      <Text variant="caption" color="secondary">
        {label}
      </Text>
      <View className="mt-2 flex-row items-center justify-between">
        <Pressable
          onPress={decrement}
          className="h-9 w-9 items-center justify-center rounded-md bg-surface dark:bg-neutral-800"
          accessibilityLabel={`Decrease ${label}`}
        >
          <Minus size={16} color={colors.textPrimary} />
        </Pressable>
        <Text
          variant="body-lg"
          className={cn('font-sans-bold', emphasis ? 'text-accent dark:text-green-400' : undefined)}
        >
          {value}
        </Text>
        <Pressable
          onPress={increment}
          className="h-9 w-9 items-center justify-center rounded-md bg-surface dark:bg-neutral-800"
          accessibilityLabel={`Increase ${label}`}
        >
          <Plus size={16} color={colors.textPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

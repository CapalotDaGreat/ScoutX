import { Pressable, View } from 'react-native';
import { Minus, Plus, X } from 'lucide-react-native';
import { Text } from '@/components/primitives/Text';
import { RATING_MAX, RATING_MIN } from '@/features/scouting-reports/constants';
import { SCOUTING_RATING_START } from '@/features/scouting-reports/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';

export type ReportRatingFieldProps = {
  label: string;
  /** Null means the scout has not rated this dimension yet. */
  value: number | null;
  onChange: (value: number | null) => void;
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
  const { t } = useAppTranslation(['scout']);

  const decrement = () => onChange(Math.max(RATING_MIN, (value ?? SCOUTING_RATING_START) - 1));
  const increment = () => onChange(Math.min(RATING_MAX, (value ?? SCOUTING_RATING_START) + 1));

  return (
    <View
      className={cn(
        'rounded-xl border border-border p-3',
        emphasis ? 'bg-accent-muted/40' : 'bg-background-secondary/50/50',
        className,
      )}
    >
      <View className="flex-row items-center justify-between">
        <Text variant="caption" color="secondary">
          {label}
        </Text>
        {value !== null ? (
          <Pressable
            onPress={() => onChange(null)}
            accessibilityRole="button"
            accessibilityLabel={t('scout:reports.clearRating', { label })}
            hitSlop={8}
          >
            <X size={14} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {value === null ? (
        <Pressable
          onPress={() => onChange(SCOUTING_RATING_START)}
          accessibilityRole="button"
          accessibilityLabel={t('scout:reports.setRating', { label })}
          className="mt-2 items-center rounded-md bg-surface py-2"
        >
          <Text variant="body-sm" color="secondary">
            {t('scout:reports.notRatedTapToSet')}
          </Text>
        </Pressable>
      ) : (
        <View className="mt-2 flex-row items-center justify-between">
          <Pressable
            onPress={decrement}
            className="h-9 w-9 items-center justify-center rounded-md bg-surface"
            accessibilityRole="button"
            accessibilityLabel={t('scout:reports.decreaseRating', { label })}
          >
            <Minus size={16} color={colors.textPrimary} />
          </Pressable>
          <Text
            variant="body-lg"
            className={cn('font-sans-bold', emphasis ? 'text-accent' : undefined)}
          >
            {value}
          </Text>
          <Pressable
            onPress={increment}
            className="h-9 w-9 items-center justify-center rounded-md bg-surface"
            accessibilityRole="button"
            accessibilityLabel={t('scout:reports.increaseRating', { label })}
          >
            <Plus size={16} color={colors.textPrimary} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

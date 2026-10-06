import { Pressable, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { Text } from '@/components/primitives/Text';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { STAR_RATING_MAX, nextStarSelection, toStarRating } from '@/utils/starRating';

export type StarRatingSize = 'xs' | 'sm' | 'md' | 'lg';

export type StarRatingProps = {
  value: number | null;
  size?: StarRatingSize;
  /** When provided, stars become tappable; tapping the selected star clears it. */
  onChange?: (value: number | null) => void;
  /** Shown instead of stars when the value is unknown and the rating is read-only. */
  emptyLabel?: string;
  /** Prefix for the accessibility label, e.g. "Weak foot". */
  label?: string;
  className?: string;
};

const STAR_PX: Record<StarRatingSize, number> = { xs: 12, sm: 16, md: 22, lg: 30 };

export function StarRating({
  value,
  size = 'sm',
  onChange,
  emptyLabel,
  label,
  className,
}: StarRatingProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('common');
  const stars = toStarRating(value);
  const px = STAR_PX[size];
  const levels = Array.from({ length: STAR_RATING_MAX }, (_, index) => index + 1);

  if (!onChange) {
    if (stars === null && emptyLabel) {
      return (
        <Text variant="body-sm" color="tertiary" className={className}>
          {emptyLabel}
        </Text>
      );
    }
    const description =
      stars === null
        ? t('stars.unknown')
        : t('stars.value', { value: stars, max: STAR_RATING_MAX });
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label ? `${label}: ${description}` : description}
        className={cn('flex-row items-center gap-0.5', className)}
      >
        {levels.map((level) => {
          const filled = stars !== null && level <= stars;
          return (
            <Star
              key={level}
              size={px}
              color={filled ? colors.gold : colors.borderStrong}
              fill={filled ? colors.gold : 'transparent'}
              strokeWidth={1.75}
            />
          );
        })}
      </View>
    );
  }

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className={cn('flex-row items-center gap-1', className)}
    >
      {levels.map((level) => {
        const filled = stars !== null && level <= stars;
        return (
          <Pressable
            key={level}
            accessibilityRole="radio"
            accessibilityState={{ checked: stars === level }}
            accessibilityLabel={t('stars.option', { count: level })}
            accessibilityHint={stars === level ? t('stars.clearHint') : undefined}
            hitSlop={6}
            onPress={() => onChange(nextStarSelection(stars, level))}
            className="p-1"
          >
            <Star
              size={px}
              color={filled ? colors.gold : colors.borderStrong}
              fill={filled ? colors.gold : 'transparent'}
              strokeWidth={1.75}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

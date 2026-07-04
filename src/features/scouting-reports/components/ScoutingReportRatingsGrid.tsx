import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { ABILITY_RATING_FIELDS } from '@/features/scouting-reports/constants';
import { getRatingTier } from '@/features/scouting-reports/models/ScoutingReportModel';
import { type ScoutingReportRatings } from '@/features/scouting-reports/types';
import { RatingPill } from '@/features/scout-discovery/components/RatingPill';
import { cn } from '@/utils/cn';

export type ScoutingReportRatingsGridProps = {
  ratings: ScoutingReportRatings;
  compact?: boolean;
  className?: string;
};

const tierColor = {
  elite: 'accent',
  strong: 'success',
  solid: 'secondary',
  developing: 'tertiary',
} as const;

export function ScoutingReportRatingsGrid({
  ratings,
  compact = false,
  className,
}: ScoutingReportRatingsGridProps) {
  return (
    <View className={cn('gap-3', className)}>
      <View className="flex-row gap-3">
        <RatingPill label="Overall" value={ratings.overall} emphasis="primary" className="flex-1" />
        <RatingPill label="Potential" value={ratings.potential} className="flex-1" />
      </View>

      <View className={cn('flex-row flex-wrap gap-2', compact ? 'gap-2' : 'gap-3')}>
        {ABILITY_RATING_FIELDS.map((field) => {
          const value = ratings[field.key];
          const tier = getRatingTier(value);
          return (
            <View
              key={field.key}
              className={cn(
                'min-w-[47%] flex-1 rounded-lg border border-border px-3 py-2 dark:border-neutral-800',
                tier === 'elite' && 'bg-accent-muted/30 dark:bg-green-950/20',
              )}
            >
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {field.label}
              </Text>
              <View className="mt-1 flex-row items-center justify-between">
                <Text weight="semibold">{value}</Text>
                <Text variant="caption" color={tierColor[tier]} className="capitalize">
                  {tier}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

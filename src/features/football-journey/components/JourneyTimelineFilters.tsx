import { ScrollView, Pressable } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { JOURNEY_FILTER_ALL, type JourneyFilterOption } from '@/features/football-journey/constants';
import { type JourneyEntryType } from '@/features/football-journey/types';
import { cn } from '@/utils/cn';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type JourneyTimelineFiltersProps = {
  activeFilter: JourneyFilterOption;
  onFilterChange: (filter: JourneyFilterOption) => void;
  availableTypes: JourneyFilterOption[];
};

export function JourneyTimelineFilters({
  activeFilter,
  onFilterChange,
  availableTypes,
}: JourneyTimelineFiltersProps) {
  const { t } = useAppTranslation('career');
  const filters: Array<{ value: JourneyFilterOption; label: string }> = [
    { value: JOURNEY_FILTER_ALL, label: t('journeyType.all') },
    ...availableTypes
      .filter((type): type is JourneyEntryType => type !== JOURNEY_FILTER_ALL)
      .map((type) => ({
        value: type,
        label: t(`journeyType.${type}`),
      })),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2"
      className="-mx-1"
    >
      {filters.map((filter) => {
        const isActive = activeFilter === filter.value;
        return (
          <Pressable
            key={filter.value}
            onPress={() => onFilterChange(filter.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            className={cn(
              'rounded-full border px-3 py-1.5',
              isActive
                ? 'border-accent bg-accent-muted'
                : 'border-border bg-background-secondary/70',
            )}
          >
            <Text
              variant="caption"
              className={cn(
                'font-sans-semibold',
                isActive ? 'text-accent' : 'text-foreground-secondary',
              )}
            >
              {filter.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

import { ScrollView, Pressable } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { JOURNEY_FILTER_ALL, JOURNEY_TYPE_META, type JourneyFilterOption } from '@/features/football-journey/constants';
import { type JourneyEntryType } from '@/features/football-journey/types';
import { cn } from '@/utils/cn';

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
  const filters: Array<{ value: JourneyFilterOption; label: string }> = [
    { value: JOURNEY_FILTER_ALL, label: 'All' },
    ...availableTypes
      .filter((type): type is JourneyEntryType => type !== JOURNEY_FILTER_ALL)
      .map((type) => ({
        value: type,
        label: JOURNEY_TYPE_META[type].label,
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

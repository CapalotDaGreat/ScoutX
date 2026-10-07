import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Text } from '@/components/primitives/Text';
import { JourneyEntryCard } from '@/features/football-journey/components/JourneyEntryCard';
import { JourneyTimelineFilters } from '@/features/football-journey/components/JourneyTimelineFilters';
import { JOURNEY_FILTER_ALL } from '@/features/football-journey/constants';
import { type JourneyFilterOption } from '@/features/football-journey/constants';
import { groupJourneyByYear } from '@/features/football-journey/models/JourneyModel';
import { filterJourneyEntries } from '@/features/football-journey/services/journeyTimelineService';
import { type JourneyEntry, type JourneyEntryType } from '@/features/football-journey/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type FootballJourneyTimelineProps = {
  entries: JourneyEntry[];
  showFilters?: boolean;
  emptyMessage?: string;
};

export function FootballJourneyTimeline({
  entries,
  showFilters = true,
  emptyMessage,
}: FootballJourneyTimelineProps) {
  const { t } = useAppTranslation('career');
  const [activeFilter, setActiveFilter] = useState<JourneyFilterOption>(JOURNEY_FILTER_ALL);

  const availableTypes = useMemo(() => {
    const types = new Set<JourneyEntryType>();
    for (const entry of entries) {
      types.add(entry.type);
    }
    return Array.from(types);
  }, [entries]);

  const filteredEntries = useMemo(
    () => filterJourneyEntries(entries, activeFilter),
    [activeFilter, entries],
  );

  const yearGroups = useMemo(() => groupJourneyByYear(filteredEntries), [filteredEntries]);

  if (entries.length === 0) {
    return (
      <View className="rounded-xl border border-dashed border-border bg-background-secondary/50 px-4 py-8/50">
        <Text variant="body-sm" color="secondary" className="text-center">
          {emptyMessage ?? t('journeyUi.empty')}
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-4">
      {showFilters && availableTypes.length > 1 ? (
        <JourneyTimelineFilters
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          availableTypes={availableTypes}
        />
      ) : null}

      {filteredEntries.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('journeyUi.noFilterMatch')}
        </Text>
      ) : (
        yearGroups.map((group, groupIndex) => (
          <View key={group.year} className="gap-3">
            <Animated.View entering={FadeInDown.delay(groupIndex * 30).duration(300)}>
              <Text variant="label" color="accent" className="uppercase tracking-wider">
                {group.year}
              </Text>
            </Animated.View>
            {group.entries.map((entry, index) => {
              const isLastInGroup = index === group.entries.length - 1;
              const isLastOverall =
                groupIndex === yearGroups.length - 1 && isLastInGroup;
              return (
                <JourneyEntryCard
                  key={entry.id}
                  entry={entry}
                  index={index + groupIndex * 3}
                  isLast={isLastOverall}
                />
              );
            })}
          </View>
        ))
      )}
    </View>
  );
}

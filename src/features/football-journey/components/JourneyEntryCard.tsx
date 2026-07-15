import Animated, { FadeInUp } from 'react-native-reanimated';
import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Badge } from '@/components/primitives/Badge';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { JOURNEY_TYPE_META } from '@/features/football-journey/constants';
import { JourneyEntryMedia } from '@/features/football-journey/components/JourneyEntryMedia';
import {
  formatJourneyDate,
  getJourneyEntryAccent,
} from '@/features/football-journey/services/journeyTimelineService';
import { type JourneyEntry } from '@/features/football-journey/types';
import { cn } from '@/utils/cn';

export type JourneyEntryCardProps = {
  entry: JourneyEntry;
  index: number;
  isLast?: boolean;
};

export function JourneyEntryCard({ entry, index, isLast = false }: JourneyEntryCardProps) {
  const { colors } = useTheme();
  const meta = JOURNEY_TYPE_META[entry.type];
  const Icon = meta.icon;
  const accent = getJourneyEntryAccent(entry.type);

  return (
    <Animated.View
      entering={FadeInUp.delay(Math.min(index, 10) * 45).duration(380)}
      className="flex-row gap-3"
    >
      <View className="items-center pt-1">
        <View
          className={cn(
            'h-10 w-10 items-center justify-center rounded-full border-2 border-surface',
            meta.accentClass,
          )}
        >
          <Icon size={18} color={colors.accent} />
        </View>
        {!isLast ? (
          <View className="mt-1 w-0.5 flex-1 bg-border" />
        ) : null}
      </View>

      <Card variant="outlined" padding="md" className="mb-2 flex-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Badge label={meta.label} variant={accent} size="sm" />
          <Text variant="caption" color="secondary">
            {formatJourneyDate(entry.date, entry.endDate)}
          </Text>
        </View>

        <Text weight="semibold" className="mt-2">
          {entry.title}
        </Text>

        {entry.subtitle ? (
          <Text variant="body-sm" color="accent" className="mt-0.5">
            {entry.subtitle}
          </Text>
        ) : null}

        {entry.organization ? (
          <Text variant="body-sm" color="secondary" className="mt-1">
            {entry.organization}
          </Text>
        ) : null}

        {entry.description ? (
          <Text variant="body-sm" color="secondary" className="mt-2 leading-5">
            {entry.description}
          </Text>
        ) : null}

        <JourneyEntryMedia media={entry.media} />
      </Card>
    </Animated.View>
  );
}

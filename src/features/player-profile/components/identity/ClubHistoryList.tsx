import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { type ClubHistoryEntry } from '@/features/player-profile/types/footballIdentity';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ClubHistoryListProps = {
  entries: ClubHistoryEntry[];
};

export function ClubHistoryList({ entries }: ClubHistoryListProps) {
  const { t } = useAppTranslation('portfolio');
  if (entries.length === 0) {
    return (
      <Text variant="body-sm" color="secondary">
        {t('profileUi.clubHistoryEmpty')}
      </Text>
    );
  }

  return (
    <View className="gap-2">
      {entries.map((entry) => (
        <Card key={`${entry.club}-${entry.period}`} variant="outlined" padding="md">
          <Text weight="semibold">{entry.club}</Text>
          <Text variant="body-sm" color="secondary">
            {[
              entry.period,
              entry.yearsAtClub !== undefined ? t('profileUi.years', { count: entry.yearsAtClub }) : null,
              entry.league || null,
              entry.appearances !== undefined ? t('profileUi.apps', { count: entry.appearances }) : null,
            ]
              .filter((part): part is string => Boolean(part))
              .join(' · ')}
          </Text>
        </Card>
      ))}
    </View>
  );
}

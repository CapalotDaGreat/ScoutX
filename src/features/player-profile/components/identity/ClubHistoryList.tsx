import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { type ClubHistoryEntry } from '@/features/player-profile/types/footballIdentity';

export type ClubHistoryListProps = {
  entries: ClubHistoryEntry[];
};

export function ClubHistoryList({ entries }: ClubHistoryListProps) {
  if (entries.length === 0) {
    return (
      <Text variant="body-sm" color="secondary">
        No club history added yet.
      </Text>
    );
  }

  return (
    <View className="gap-2">
      {entries.map((entry) => (
        <Card key={`${entry.club}-${entry.period}`} variant="outlined" padding="md">
          <Text weight="semibold">{entry.club}</Text>
          <Text variant="body-sm" color="secondary">
            {entry.period}
            {entry.league ? ` · ${entry.league}` : ''}
            {entry.appearances !== undefined ? ` · ${entry.appearances} apps` : ''}
          </Text>
        </Card>
      ))}
    </View>
  );
}

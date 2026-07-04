import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { type ClubHistoryEntry } from '@/features/player-profile/types/footballIdentity';

export type ClubHistoryEditorProps = {
  entries: ClubHistoryEntry[];
  onChange: (entries: ClubHistoryEntry[]) => void;
};

const emptyEntry = (): ClubHistoryEntry => ({
  club: '',
  period: '',
  league: '',
  appearances: undefined,
});

export function ClubHistoryEditor({ entries, onChange }: ClubHistoryEditorProps) {
  const updateEntry = (index: number, patch: Partial<ClubHistoryEntry>) => {
    onChange(entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
  };

  return (
    <View className="gap-3">
      <Text variant="label" color="secondary">
        Club History
      </Text>
      {entries.map((entry, index) => (
        <View key={`${entry.club}-${index}`} className="gap-2 rounded-xl border border-border p-3 dark:border-neutral-800">
          <Input
            label="Club"
            value={entry.club}
            onChangeText={(value) => updateEntry(index, { club: value })}
          />
          <Input
            label="Period"
            value={entry.period}
            onChangeText={(value) => updateEntry(index, { period: value })}
            placeholder="2022–Present"
          />
          <Input
            label="League"
            value={entry.league ?? ''}
            onChangeText={(value) => updateEntry(index, { league: value })}
          />
          <Button variant="secondary" size="sm" onPress={() => onChange(entries.filter((_, i) => i !== index))}>
            Remove
          </Button>
        </View>
      ))}
      <Button variant="secondary" size="sm" onPress={() => onChange([...entries, emptyEntry()])}>
        Add Club
      </Button>
    </View>
  );
}

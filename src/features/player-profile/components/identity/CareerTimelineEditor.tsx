import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Dropdown } from '@/components/primitives/Dropdown';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import {
  type CareerTimelineEntry,
  type CareerTimelineEntryType,
} from '@/features/player-profile/types/footballIdentity';

export type CareerTimelineEditorProps = {
  entries: CareerTimelineEntry[];
  onChange: (entries: CareerTimelineEntry[]) => void;
};

const timelineTypes: { label: string; value: CareerTimelineEntryType }[] = [
  { label: 'Club', value: 'club' },
  { label: 'Achievement', value: 'achievement' },
  { label: 'Transfer', value: 'transfer' },
  { label: 'Education', value: 'education' },
];

function createEntry(): CareerTimelineEntry {
  return {
    id: `timeline-${Date.now()}`,
    type: 'club',
    title: '',
    organization: '',
    period: '',
    description: '',
  };
}

export function CareerTimelineEditor({ entries, onChange }: CareerTimelineEditorProps) {
  const updateEntry = (index: number, patch: Partial<CareerTimelineEntry>) => {
    onChange(entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
  };

  return (
    <View className="gap-3">
      <Text variant="label" color="secondary">
        Career Timeline
      </Text>
      {entries.map((entry, index) => (
        <View key={entry.id} className="gap-2 rounded-xl border border-border p-3 dark:border-neutral-800">
          <Dropdown
            label="Type"
            value={entry.type}
            onChange={(value) => updateEntry(index, { type: value })}
            options={timelineTypes}
          />
          <Input
            label="Title"
            value={entry.title}
            onChangeText={(value) => updateEntry(index, { title: value })}
          />
          <Input
            label="Organization"
            value={entry.organization}
            onChangeText={(value) => updateEntry(index, { organization: value })}
          />
          <Input
            label="Period"
            value={entry.period}
            onChangeText={(value) => updateEntry(index, { period: value })}
          />
          <Input
            label="Description"
            value={entry.description ?? ''}
            onChangeText={(value) => updateEntry(index, { description: value })}
            multiline
            numberOfLines={2}
          />
          <Button variant="secondary" size="sm" onPress={() => onChange(entries.filter((_, i) => i !== index))}>
            Remove
          </Button>
        </View>
      ))}
      <Button variant="secondary" size="sm" onPress={() => onChange([...entries, createEntry()])}>
        Add Timeline Entry
      </Button>
    </View>
  );
}

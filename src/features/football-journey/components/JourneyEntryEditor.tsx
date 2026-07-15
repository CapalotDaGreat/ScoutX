import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Dropdown } from '@/components/primitives/Dropdown';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { JOURNEY_TYPE_OPTIONS } from '@/features/football-journey/constants';
import { type JourneyEntry, type JourneyEntryType } from '@/features/football-journey/types';

export type JourneyEntryEditorProps = {
  entry: JourneyEntry;
  onChange: (entry: JourneyEntry) => void;
  onRemove: () => void;
};

export function JourneyEntryEditor({ entry, onChange, onRemove }: JourneyEntryEditorProps) {
  const update = (patch: Partial<JourneyEntry>) => {
    onChange({ ...entry, ...patch, updatedAt: new Date().toISOString() });
  };

  const updateMediaUrl = (index: number, url: string) => {
    const media = entry.media.map((item, itemIndex) =>
      itemIndex === index ? { ...item, url } : item,
    );
    update({ media });
  };

  const addImageMedia = () => {
    update({
      media: [...entry.media, { type: 'image', url: '' }],
    });
  };

  const addVideoMedia = () => {
    update({
      media: [
        ...entry.media,
        { type: 'video', url: '', thumbnailUrl: '' },
      ],
    });
  };

  const removeMedia = (index: number) => {
    update({ media: entry.media.filter((_, itemIndex) => itemIndex !== index) });
  };

  return (
    <View className="gap-3 rounded-xl border border-border p-3">
      <Dropdown
        label="Entry Type"
        value={entry.type}
        onChange={(value) => update({ type: value as JourneyEntryType })}
        options={JOURNEY_TYPE_OPTIONS}
      />
      <Input
        label="Title"
        value={entry.title}
        onChangeText={(value) => update({ title: value })}
        placeholder="e.g. Signed professional contract"
      />
      <Input
        label="Subtitle"
        value={entry.subtitle ?? ''}
        onChangeText={(value) => update({ subtitle: value })}
        placeholder="Optional highlight"
      />
      <Input
        label="Organization"
        value={entry.organization ?? ''}
        onChangeText={(value) => update({ organization: value })}
        placeholder="Club, federation, or academy"
      />
      <Input
        label="Date (ISO)"
        value={entry.date}
        onChangeText={(value) => update({ date: value })}
        placeholder="2025-01-15T00:00:00.000Z"
      />
      <Input
        label="End Date (ISO, optional)"
        value={entry.endDate ?? ''}
        onChangeText={(value) => update({ endDate: value || undefined })}
        placeholder="For ranges or recoveries"
      />
      <Input
        label="Description"
        value={entry.description ?? ''}
        onChangeText={(value) => update({ description: value })}
        placeholder="Tell scouts what happened and why it matters"
        multiline
        numberOfLines={3}
        inputClassName="min-h-[80px] text-top"
      />

      <Text variant="label" color="secondary">
        Media
      </Text>
      {entry.media.map((item, index) => (
        <View key={`media-${index}`} className="gap-2 rounded-lg bg-background-secondary/60 p-2">
          <Text variant="caption" color="secondary">
            {item.type === 'video' ? 'Video' : 'Image'} #{index + 1}
          </Text>
          <Input
            label="URL"
            value={item.url}
            onChangeText={(value) => updateMediaUrl(index, value)}
            placeholder="https://..."
          />
          {item.type === 'video' ? (
            <Input
              label="Thumbnail URL"
              value={item.thumbnailUrl ?? ''}
              onChangeText={(value) => {
                const media = entry.media.map((mediaItem, itemIndex) =>
                  itemIndex === index ? { ...mediaItem, thumbnailUrl: value } : mediaItem,
                );
                update({ media });
              }}
              placeholder="https://..."
            />
          ) : null}
          <Button variant="secondary" size="sm" onPress={() => removeMedia(index)}>
            Remove Media
          </Button>
        </View>
      ))}
      <View className="flex-row gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onPress={addImageMedia}>
          Add Image
        </Button>
        <Button variant="secondary" size="sm" className="flex-1" onPress={addVideoMedia}>
          Add Video
        </Button>
      </View>

      <Button variant="secondary" size="sm" onPress={onRemove}>
        Remove Entry
      </Button>
    </View>
  );
}

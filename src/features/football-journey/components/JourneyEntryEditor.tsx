import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Dropdown } from '@/components/primitives/Dropdown';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { JOURNEY_TYPES } from '@/features/football-journey/constants';
import { type JourneyEntry, type JourneyEntryType } from '@/features/football-journey/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type JourneyEntryEditorProps = {
  entry: JourneyEntry;
  onChange: (entry: JourneyEntry) => void;
  onRemove: () => void;
};

export function JourneyEntryEditor({ entry, onChange, onRemove }: JourneyEntryEditorProps) {
  const { t } = useAppTranslation(['career']);

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
        label={t('journeyEditor.entryType')}
        value={entry.type}
        onChange={(value) => update({ type: value as JourneyEntryType })}
        options={JOURNEY_TYPES.map((type) => ({ value: type, label: t(`journeyType.${type}`) }))}
      />
      <Input
        label={t('journeyEditor.title')}
        value={entry.title}
        onChangeText={(value) => update({ title: value })}
        placeholder={t('journeyEditor.titlePlaceholder')}
      />
      <Input
        label={t('journeyEditor.subtitle')}
        value={entry.subtitle ?? ''}
        onChangeText={(value) => update({ subtitle: value })}
        placeholder={t('journeyEditor.subtitlePlaceholder')}
      />
      <Input
        label={t('journeyEditor.organization')}
        value={entry.organization ?? ''}
        onChangeText={(value) => update({ organization: value })}
        placeholder={t('journeyEditor.organizationPlaceholder')}
      />
      <Input
        label={t('journeyEditor.dateIso')}
        value={entry.date}
        onChangeText={(value) => update({ date: value })}
        placeholder="2025-01-15T00:00:00.000Z"
      />
      <Input
        label={t('journeyEditor.endDateIso')}
        value={entry.endDate ?? ''}
        onChangeText={(value) => update({ endDate: value || undefined })}
        placeholder={t('journeyEditor.endDatePlaceholder')}
      />
      <Input
        label={t('journeyEditor.description')}
        value={entry.description ?? ''}
        onChangeText={(value) => update({ description: value })}
        placeholder={t('journeyEditor.descriptionPlaceholder')}
        multiline
        numberOfLines={3}
        inputClassName="min-h-[80px] text-top"
      />

      <Text variant="label" color="secondary">
        {t('journeyEditor.media')}
      </Text>
      {entry.media.map((item, index) => (
        <View key={`media-${index}`} className="gap-2 rounded-lg bg-background-secondary/60 p-2">
          <Text variant="caption" color="secondary">
            {item.type === 'video' ? t('journeyEditor.video') : t('journeyEditor.image')} #{index + 1}
          </Text>
          <Input
            label={t('journeyEditor.url')}
            value={item.url}
            onChangeText={(value) => updateMediaUrl(index, value)}
            placeholder="https://..."
          />
          {item.type === 'video' ? (
            <Input
              label={t('journeyEditor.thumbnailUrl')}
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
            {t('journeyEditor.removeMedia')}
          </Button>
        </View>
      ))}
      <View className="flex-row gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onPress={addImageMedia}>
          {t('journeyEditor.addImage')}
        </Button>
        <Button variant="secondary" size="sm" className="flex-1" onPress={addVideoMedia}>
          {t('journeyEditor.addVideo')}
        </Button>
      </View>

      <Button variant="secondary" size="sm" onPress={onRemove}>
        {t('journeyEditor.removeEntry')}
      </Button>
    </View>
  );
}

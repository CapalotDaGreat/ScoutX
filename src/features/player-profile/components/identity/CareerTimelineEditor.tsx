import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Dropdown } from '@/components/primitives/Dropdown';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import {
  type CareerTimelineEntry,
  type CareerTimelineEntryType,
} from '@/features/player-profile/types/footballIdentity';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type CareerTimelineEditorProps = {
  entries: CareerTimelineEntry[];
  onChange: (entries: CareerTimelineEntry[]) => void;
};

const TIMELINE_TYPES: CareerTimelineEntryType[] = ['club', 'achievement', 'transfer', 'education'];

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
  const { t } = useAppTranslation(['portfolio', 'common']);
  const timelineTypes = TIMELINE_TYPES.map((value) => ({
    value,
    label: t(`portfolio:profileUi.timelineEditor.type.${value}`),
  }));
  const updateEntry = (index: number, patch: Partial<CareerTimelineEntry>) => {
    onChange(entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
  };

  return (
    <View className="gap-3">
      <Text variant="label" color="secondary">
        {t('portfolio:sections.careerTimeline.title')}
      </Text>
      {entries.map((entry, index) => (
        <View key={entry.id} className="gap-2 rounded-xl border border-border p-3">
          <Dropdown
            label={t('portfolio:profileUi.timelineEditor.typeLabel')}
            value={entry.type}
            onChange={(value) => updateEntry(index, { type: value })}
            options={timelineTypes}
          />
          <Input
            label={t('portfolio:profileUi.timelineEditor.title')}
            value={entry.title}
            onChangeText={(value) => updateEntry(index, { title: value })}
          />
          <Input
            label={t('portfolio:profileUi.timelineEditor.organization')}
            value={entry.organization}
            onChangeText={(value) => updateEntry(index, { organization: value })}
          />
          <Input
            label={t('portfolio:profileUi.period')}
            value={entry.period}
            onChangeText={(value) => updateEntry(index, { period: value })}
          />
          <Input
            label={t('portfolio:profileUi.timelineEditor.description')}
            value={entry.description ?? ''}
            onChangeText={(value) => updateEntry(index, { description: value })}
            multiline
            numberOfLines={2}
          />
          <Button variant="secondary" size="sm" onPress={() => onChange(entries.filter((_, i) => i !== index))}>
            {t('common:remove')}
          </Button>
        </View>
      ))}
      <Button variant="secondary" size="sm" onPress={() => onChange([...entries, createEntry()])}>
        {t('portfolio:profileUi.timelineEditor.add')}
      </Button>
    </View>
  );
}

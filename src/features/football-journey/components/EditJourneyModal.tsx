import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { JourneyEntryEditor } from '@/features/football-journey/components/JourneyEntryEditor';
import {
  createEmptyJourneyEntry,
  resolveJourneyEntries,
  sortJourneyEntries,
} from '@/features/football-journey/models/JourneyModel';
import { type JourneyEntry } from '@/features/football-journey/types';
import { type PlayerProfile } from '@/features/player-profile/types';
import { toUserMessage } from '@/utils/userFacingError';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type EditJourneyModalProps = {
  visible: boolean;
  profile: PlayerProfile;
  onClose: () => void;
  onSave: (data: Partial<PlayerProfile>) => Promise<void>;
};

export function EditJourneyModal({ visible, profile, onClose, onSave }: EditJourneyModalProps) {
  const { t } = useAppTranslation(['career', 'common']);
  const [entries, setEntries] = useState<JourneyEntry[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setEntries(resolveJourneyEntries(profile.footballJourney, profile.identity.careerTimeline));
    }
  }, [visible, profile]);

  const handleSave = async () => {
    const invalid = entries.find((entry) => !entry.title.trim() || !entry.date.trim());
    if (invalid) {
      Alert.alert(t('career:journeyUi.validationTitle'), t('career:journeyUi.validationBody'));
      return;
    }

    setSaving(true);
    try {
      await onSave({
        footballJourney: {
          entries: sortJourneyEntries(entries),
          updatedAt: new Date().toISOString(),
        },
      });
      onClose();
    } catch (err) {
      Alert.alert(t('career:journeyUi.saveFailedTitle'), toUserMessage(err, t('career:journeyUi.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const updateEntry = (index: number, entry: JourneyEntry) => {
    setEntries((current) => current.map((item, itemIndex) => (itemIndex === index ? entry : item)));
  };

  const footer = (
    <View className="flex-row gap-3">
      <Button variant="secondary" className="flex-1" onPress={onClose} disabled={saving}>
        {t('common:cancel')}
      </Button>
      <Button variant="accent" className="flex-1" onPress={() => void handleSave()} loading={saving}>
        {t('career:journeyUi.save')}
      </Button>
    </View>
  );

  return (
    <Modal visible={visible} onClose={onClose} title={t('career:journeyUi.editTitle')} size="sheet" footer={footer}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="body-sm" color="secondary" className="mb-4">
          {t('career:journeyUi.editIntro')}
        </Text>

        <View className="gap-4">
          {entries.map((entry, index) => (
            <JourneyEntryEditor
              key={entry.id}
              entry={entry}
              onChange={(next) => updateEntry(index, next)}
              onRemove={() => setEntries((current) => current.filter((_, i) => i !== index))}
            />
          ))}
        </View>

        <Button
          variant="secondary"
          className="mt-4"
          onPress={() => setEntries((current) => [createEmptyJourneyEntry(), ...current])}
        >
          {t('career:journeyUi.addEntry')}
        </Button>
      </ScrollView>
    </Modal>
  );
}

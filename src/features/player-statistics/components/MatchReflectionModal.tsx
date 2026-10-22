import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { buildMatchReflection } from '@/features/player-statistics/models/MatchLogModel';
import {
  hasMatchReflection,
  type MatchHistoryItem,
  type MatchReflection,
} from '@/features/player-statistics/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type MatchReflectionModalProps = {
  visible: boolean;
  item: MatchHistoryItem | null;
  onClose: () => void;
  onSave: (matchId: string, reflection: MatchReflection | null) => Promise<void>;
};

/**
 * Post-match reflection in the player's own words. Clearly self-reported: it is never
 * presented as a verified event or AI observation, and it is stripped from the public
 * Passport projection.
 */
export function MatchReflectionModal({ visible, item, onClose, onSave }: MatchReflectionModalProps) {
  const { t } = useAppTranslation('statistics');
  const [wentWell, setWentWell] = useState('');
  const [difficult, setDifficult] = useState('');
  const [nextPriority, setNextPriority] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && item) {
      setWentWell(item.reflection?.wentWell ?? '');
      setDifficult(item.reflection?.difficult ?? '');
      setNextPriority(item.reflection?.nextPriority ?? '');
      setError(null);
    }
  }, [item, visible]);

  if (!item) {
    return null;
  }

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSave(item.id, buildMatchReflection(wentWell, difficult, nextPriority));
      onClose();
    } catch {
      setError(t('reflection.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSave(item.id, null);
      onClose();
    } catch {
      setError(t('reflection.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={t('reflection.title', { opponent: item.opponent })}
      size="lg"
    >
      <View className="gap-4">
        <Text variant="body-sm" color="secondary">
          {t('reflection.intro')}
        </Text>
        <Input
          label={t('reflection.wentWell')}
          value={wentWell}
          onChangeText={setWentWell}
          placeholder={t('reflection.wentWellPlaceholder')}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          editable={!isSaving}
          inputClassName="min-h-16 py-2"
        />
        <Input
          label={t('reflection.difficult')}
          value={difficult}
          onChangeText={setDifficult}
          placeholder={t('reflection.difficultPlaceholder')}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          editable={!isSaving}
          inputClassName="min-h-16 py-2"
        />
        <Input
          label={t('reflection.nextPriority')}
          value={nextPriority}
          onChangeText={setNextPriority}
          placeholder={t('reflection.nextPriorityPlaceholder')}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          editable={!isSaving}
          inputClassName="min-h-16 py-2"
        />
        <Text variant="caption" color="tertiary">
          {t('reflection.privateNote')}
        </Text>
        {error ? (
          <Text variant="body-sm" color="error" accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}
        <Button variant="accent" onPress={() => void handleSave()} disabled={isSaving}>
          {t('reflection.save')}
        </Button>
        {hasMatchReflection(item.reflection) ? (
          <Button variant="ghost" onPress={() => void handleClear()} disabled={isSaving}>
            {t('reflection.clear')}
          </Button>
        ) : null}
      </View>
    </Modal>
  );
}

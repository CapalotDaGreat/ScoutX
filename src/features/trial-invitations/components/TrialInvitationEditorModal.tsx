import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import {
  type TrialInvitation,
  type TrialInvitationDraft,
  createEmptyTrialDraft,
} from '@/features/trial-invitations/types';
import { toUserMessage } from '@/utils/userFacingError';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type TrialInvitationEditorModalProps = {
  visible: boolean;
  playerName: string;
  invitation?: TrialInvitation | null;
  saving?: boolean;
  mode?: 'create' | 'reschedule';
  onClose: () => void;
  onSubmit: (draft: TrialInvitationDraft) => Promise<void>;
};

export function TrialInvitationEditorModal({
  visible,
  playerName,
  invitation,
  saving = false,
  mode = 'create',
  onClose,
  onSubmit,
}: TrialInvitationEditorModalProps) {
  const { t } = useAppTranslation(['trials', 'common']);
  const [draft, setDraft] = useState<TrialInvitationDraft>(createEmptyTrialDraft());

  useEffect(() => {
    if (!visible) {
      return;
    }
    if (invitation) {
      setDraft({
        club: invitation.club,
        coach: invitation.coach,
        location: invitation.location,
        scheduledDate: invitation.scheduledDate,
        notes: invitation.notes,
      });
      return;
    }
    setDraft(createEmptyTrialDraft());
  }, [invitation, visible]);

  const handleSubmit = async () => {
    if (!draft.club.trim() || !draft.coach.trim() || !draft.location.trim()) {
      Alert.alert(t('trials:editor.validationTitle'), t('trials:editor.requiredFields'));
      return;
    }
    if (Number.isNaN(Date.parse(draft.scheduledDate))) {
      Alert.alert(t('trials:editor.validationTitle'), t('trials:editor.invalidDate'));
      return;
    }

    try {
      await onSubmit(draft);
      onClose();
    } catch (error) {
      Alert.alert(t('common:errorTitle'), toUserMessage(error, t('trials:editor.saveFailed')));
    }
  };

  const title = mode === 'reschedule' ? t('trials:editor.rescheduleTitle') : t('trials:editor.inviteTitle');

  const footer = (
    <View className="flex-row gap-3">
      <Button variant="secondary" className="flex-1" onPress={onClose} disabled={saving}>
        {t('common:cancel')}
      </Button>
      <Button variant="accent" className="flex-1" onPress={() => void handleSubmit()} loading={saving}>
        {mode === 'reschedule' ? t('trials:reschedule') : t('trials:editor.send')}
      </Button>
    </View>
  );

  return (
    <Modal visible={visible} onClose={onClose} title={title} size="sheet" footer={footer}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-4">
          <Text variant="body-sm" color="secondary">
            {t('trials:editor.intro', { name: playerName })}
          </Text>
          <Input
            label={t('trials:editor.club')}
            value={draft.club}
            onChangeText={(value) => setDraft((current) => ({ ...current, club: value }))}
            placeholder={t('trials:editor.clubPlaceholder')}
          />
          <Input
            label={t('trials:editor.coach')}
            value={draft.coach}
            onChangeText={(value) => setDraft((current) => ({ ...current, coach: value }))}
            placeholder={t('trials:editor.coachPlaceholder')}
          />
          <Input
            label={t('trials:editor.location')}
            value={draft.location}
            onChangeText={(value) => setDraft((current) => ({ ...current, location: value }))}
            placeholder={t('trials:editor.locationPlaceholder')}
          />
          <Input
            label={t('trials:editor.date')}
            hint={t('trials:editor.dateHint')}
            value={draft.scheduledDate}
            onChangeText={(value) => setDraft((current) => ({ ...current, scheduledDate: value }))}
            placeholder="2025-07-12T14:00:00.000Z"
          />
          <Input
            label={t('trials:editor.notes')}
            value={draft.notes}
            onChangeText={(value) => setDraft((current) => ({ ...current, notes: value }))}
            placeholder={t('trials:editor.notesPlaceholder')}
            multiline
            numberOfLines={4}
            inputClassName="min-h-[90px] text-top"
          />
        </View>
      </ScrollView>
    </Modal>
  );
}

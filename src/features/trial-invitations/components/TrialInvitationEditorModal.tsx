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
      Alert.alert('Validation', 'Club, coach, and location are required.');
      return;
    }

    try {
      await onSubmit(draft);
      onClose();
    } catch (error) {
      Alert.alert('Error', toUserMessage(error, 'Could not save trial.'));
    }
  };

  const title = mode === 'reschedule' ? 'Reschedule Trial' : 'Invite to Trial';

  const footer = (
    <View className="flex-row gap-3">
      <Button variant="secondary" className="flex-1" onPress={onClose} disabled={saving}>
        Cancel
      </Button>
      <Button variant="accent" className="flex-1" onPress={() => void handleSubmit()} loading={saving}>
        {mode === 'reschedule' ? 'Reschedule' : 'Send Invitation'}
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
            Professional trial invitation for {playerName}
          </Text>
          <Input
            label="Club"
            value={draft.club}
            onChangeText={(value) => setDraft((current) => ({ ...current, club: value }))}
            placeholder="Northstar FC"
          />
          <Input
            label="Coach"
            value={draft.coach}
            onChangeText={(value) => setDraft((current) => ({ ...current, coach: value }))}
            placeholder="Carlos Mendez"
          />
          <Input
            label="Location"
            value={draft.location}
            onChangeText={(value) => setDraft((current) => ({ ...current, location: value }))}
            placeholder="Training Ground, Field 2"
          />
          <Input
            label="Date (ISO)"
            value={draft.scheduledDate}
            onChangeText={(value) => setDraft((current) => ({ ...current, scheduledDate: value }))}
            placeholder="2025-07-12T14:00:00.000Z"
          />
          <Input
            label="Notes"
            value={draft.notes}
            onChangeText={(value) => setDraft((current) => ({ ...current, notes: value }))}
            placeholder="Arrival instructions, kit requirements, session format..."
            multiline
            numberOfLines={4}
            inputClassName="min-h-[90px] text-top"
          />
        </View>
      </ScrollView>
    </Modal>
  );
}

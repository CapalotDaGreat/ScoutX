import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { TrialHistoryTimeline } from '@/features/trial-invitations/components/TrialHistoryTimeline';
import { TrialReplayCard } from '@/features/career-story/components/TrialReplayCard';
import { TrialStatusBadge } from '@/features/trial-invitations/components/TrialStatusBadge';
import { formatTrialDate } from '@/features/trial-invitations/models/TrialInvitationModel';
import {
  getCalendarActionLabel,
  openTrialInCalendar,
} from '@/features/trial-invitations/services/trialCalendarService';
import { PLAYER_RESPONDABLE_STATUSES } from '@/features/trial-invitations/constants';
import { type TrialInvitation } from '@/features/trial-invitations/types';
import { toUserMessage } from '@/utils/userFacingError';

export type TrialInvitationResponseModalProps = {
  visible: boolean;
  invitation: TrialInvitation | null;
  saving?: boolean;
  onClose: () => void;
  onAccept: (invitation: TrialInvitation, note?: string) => Promise<void>;
  onDecline: (invitation: TrialInvitation, note?: string) => Promise<void>;
};

export function TrialInvitationResponseModal({
  visible,
  invitation,
  saving = false,
  onClose,
  onAccept,
  onDecline,
}: TrialInvitationResponseModalProps) {
  const [note, setNote] = useState('');

  if (!invitation) {
    return null;
  }

  const canRespond = PLAYER_RESPONDABLE_STATUSES.includes(invitation.status);

  const footer = canRespond ? (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <Button
          variant="secondary"
          className="flex-1"
          onPress={() => {
            Alert.alert('Decline Trial', 'Are you sure you want to decline this invitation?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Decline',
                style: 'destructive',
                onPress: () => {
                  void onDecline(invitation, note)
                    .then(onClose)
                    .catch((error: unknown) => {
                      Alert.alert(
                        'Error',
                        toUserMessage(error, 'Could not decline trial.'),
                      );
                    });
                },
              },
            ]);
          }}
          disabled={saving}
        >
          Decline
        </Button>
        <Button
          variant="accent"
          className="flex-1"
          onPress={() => {
            void onAccept(invitation, note)
              .then(onClose)
              .catch((error: unknown) => {
                Alert.alert(
                  'Error',
                  toUserMessage(error, 'Could not accept trial.'),
                );
              });
          }}
          loading={saving}
        >
          Accept
        </Button>
      </View>
    </View>
  ) : (
    <Button variant="secondary" onPress={onClose}>
      Close
    </Button>
  );

  return (
    <Modal visible={visible} onClose={onClose} title="Trial Invitation" size="sheet" footer={footer}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-4">
          <View className="flex-row items-center justify-between">
            <Text weight="semibold">{invitation.club}</Text>
            <TrialStatusBadge status={invitation.status} />
          </View>
          <Text variant="body-sm" color="secondary">
            {formatTrialDate(invitation.scheduledDate)} · {invitation.location}
          </Text>
          <Text variant="body-sm" color="secondary">
            Coach {invitation.coach} · Scout {invitation.scoutName}
          </Text>
          {invitation.notes ? (
            <Text variant="body-sm" color="secondary">
              {invitation.notes}
            </Text>
          ) : null}

          {canRespond ? (
            <Input
              label="Response note (optional)"
              value={note}
              onChangeText={setNote}
              placeholder="Availability confirmation or questions for the scout..."
              multiline
              numberOfLines={3}
              inputClassName="min-h-[70px] text-top"
            />
          ) : null}

          <Button
            variant="secondary"
            onPress={() => {
              void openTrialInCalendar(invitation).catch((error: unknown) => {
                Alert.alert(
                  'Calendar',
                  toUserMessage(error, 'Could not open calendar.'),
                );
              });
            }}
          >
            {getCalendarActionLabel()}
          </Button>

          <Text variant="label" color="secondary">
            History
          </Text>
          <TrialHistoryTimeline history={invitation.history} />
          <TrialReplayCard invitation={invitation} />
        </View>
      </ScrollView>
    </Modal>
  );
}

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
  calendarActionKind,
  openTrialInCalendar,
} from '@/features/trial-invitations/services/trialCalendarService';
import { PLAYER_RESPONDABLE_STATUSES } from '@/features/trial-invitations/constants';
import { type TrialInvitation } from '@/features/trial-invitations/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
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
  const { t, i18n } = useAppTranslation(['trials', 'common']);
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
            Alert.alert(t('trials:response.declineTitle'), t('trials:response.declineBody'), [
              { text: t('common:cancel'), style: 'cancel' },
              {
                text: t('trials:decline'),
                style: 'destructive',
                onPress: () => {
                  void onDecline(invitation, note)
                    .then(onClose)
                    .catch((error: unknown) => {
                      Alert.alert(
                        t('common:errorTitle'),
                        toUserMessage(error, t('trials:response.declineFailed')),
                      );
                    });
                },
              },
            ]);
          }}
          disabled={saving}
        >
          {t('trials:decline')}
        </Button>
        <Button
          variant="accent"
          className="flex-1"
          onPress={() => {
            void onAccept(invitation, note)
              .then(onClose)
              .catch((error: unknown) => {
                Alert.alert(
                  t('common:errorTitle'),
                  toUserMessage(error, t('trials:response.acceptFailed')),
                );
              });
          }}
          loading={saving}
        >
          {t('trials:accept')}
        </Button>
      </View>
    </View>
  ) : (
    <Button variant="secondary" onPress={onClose}>
      {t('common:close')}
    </Button>
  );

  return (
    <Modal visible={visible} onClose={onClose} title={t('trials:card.overline')} size="sheet" footer={footer}>
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
            {formatTrialDate(invitation.scheduledDate, i18n.language)} · {invitation.location}
          </Text>
          <Text variant="body-sm" color="secondary">
            {t('trials:response.coachScout', { coach: invitation.coach, scout: invitation.scoutName })}
          </Text>
          {invitation.notes ? (
            <Text variant="body-sm" color="secondary">
              {invitation.notes}
            </Text>
          ) : null}

          {canRespond ? (
            <Input
              label={t('responseNote')}
              value={note}
              onChangeText={setNote}
              placeholder={t('responseNotePlaceholder')}
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
                  t('trials:response.calendarTitle'),
                  toUserMessage(error, t('trials:response.calendarFailed')),
                );
              });
            }}
          >
            {t(`trials:response.calendar.${calendarActionKind()}`)}
          </Button>

          <Text variant="label" color="secondary">
            {t('trials:response.history')}
          </Text>
          <TrialHistoryTimeline history={invitation.history} />
          <TrialReplayCard invitation={invitation} />
        </View>
      </ScrollView>
    </Modal>
  );
}

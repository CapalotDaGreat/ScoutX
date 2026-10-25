import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Section } from '@/components/layout/Section';
import { TrialInvitationCard } from '@/features/trial-invitations/components/TrialInvitationCard';
import { TrialInvitationEditorModal } from '@/features/trial-invitations/components/TrialInvitationEditorModal';
import { TrialHistoryTimeline } from '@/features/trial-invitations/components/TrialHistoryTimeline';
import { useScoutTrialInvitations } from '@/features/trial-invitations/hooks/useTrialInvitations';
import {
  SCOUT_CANCELLABLE_STATUSES,
  SCOUT_RESCHEDULABLE_STATUSES,
} from '@/features/trial-invitations/constants';
import { type TrialInvitation } from '@/features/trial-invitations/types';
import { toUserMessage } from '@/utils/userFacingError';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ScoutTrialInvitationsSectionProps = {
  playerId: string;
  playerName: string;
  onInvitePress?: () => void;
  inviteSignal?: number;
};

export function ScoutTrialInvitationsSection({
  playerId,
  playerName,
  onInvitePress,
  inviteSignal = 0,
}: ScoutTrialInvitationsSectionProps) {
  const { t } = useAppTranslation(['trials', 'common']);
  const { trials, isLoading, isSaving, createTrial, rescheduleTrial, cancelTrial } =
    useScoutTrialInvitations(playerId, playerName);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'reschedule'>('create');
  const [activeTrial, setActiveTrial] = useState<TrialInvitation | null>(null);

  const openCreate = () => {
    setActiveTrial(null);
    setEditorMode('create');
    setEditorVisible(true);
    onInvitePress?.();
  };

  useEffect(() => {
    if (inviteSignal > 0) {
      setActiveTrial(null);
      setEditorMode('create');
      setEditorVisible(true);
      onInvitePress?.();
    }
  }, [inviteSignal, onInvitePress]);

  const openReschedule = (trial: TrialInvitation) => {
    setActiveTrial(trial);
    setEditorMode('reschedule');
    setEditorVisible(true);
  };

  const confirmCancel = (trial: TrialInvitation) => {
    Alert.alert(t('cancelTrialTitle'), t('cancelTrialMessage'), [
      { text: t('keep'), style: 'cancel' },
      {
        text: t('cancelTrial'),
        style: 'destructive',
        onPress: () => {
          void cancelTrial(trial).catch((error: unknown) => {
            Alert.alert(t('common:errorTitle'), toUserMessage(error, t('cancelFailed')));
          });
        },
      },
    ]);
  };

  return (
    <>
      <Section
        title={t('sectionTitle')}
        subtitle={t('sectionSubtitle')}
        action={
          <Button variant="accent" size="sm" onPress={openCreate}>
            {t('invite')}
          </Button>
        }
      >
        {isLoading ? (
          <SkeletonLoader variant="card" count={1} />
        ) : trials.length === 0 ? (
          <Text variant="body-sm" color="secondary">
            {t('sectionEmpty')}
          </Text>
        ) : (
          <View className="gap-2">
            {trials.map((trial, index) => (
              <TrialInvitationCard
                key={trial.id}
                invitation={trial}
                index={index}
                footer={
                  <View className="mt-2 gap-2 border-t border-divider pt-3">
                    {SCOUT_RESCHEDULABLE_STATUSES.includes(trial.status) ? (
                      <View className="flex-row gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1"
                          onPress={() => openReschedule(trial)}
                        >
                          {t('reschedule')}
                        </Button>
                        {SCOUT_CANCELLABLE_STATUSES.includes(trial.status) ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="flex-1"
                            onPress={() => confirmCancel(trial)}
                          >
                            {t('common:cancel')}
                          </Button>
                        ) : null}
                      </View>
                    ) : null}
                    <TrialHistoryTimeline history={trial.history.slice(0, 3)} />
                  </View>
                }
              />
            ))}
          </View>
        )}
      </Section>

      <TrialInvitationEditorModal
        visible={editorVisible}
        playerName={playerName}
        invitation={activeTrial}
        mode={editorMode}
        saving={isSaving}
        onClose={() => {
          setEditorVisible(false);
          setActiveTrial(null);
        }}
        onSubmit={async (draft) => {
          if (editorMode === 'reschedule' && activeTrial) {
            await rescheduleTrial(activeTrial, draft);
          } else {
            await createTrial(draft);
          }
        }}
      />
    </>
  );
}

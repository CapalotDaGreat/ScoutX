import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { NotificationCard } from '@/components/primitives/NotificationCard';
import { TrialInvitationCard } from '@/features/trial-invitations/components/TrialInvitationCard';
import { TrialInvitationResponseModal } from '@/features/trial-invitations/components/TrialInvitationResponseModal';
import { TrialReplayCard } from '@/features/career-story/components/TrialReplayCard';
import {
  usePlayerTrialInvitations,
  useTrialNotifications,
} from '@/features/trial-invitations/hooks/useTrialInvitations';
import { type TrialInvitation } from '@/features/trial-invitations/types';
import { Section } from '@/components/layout/Section';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type PlayerTrialsScreenProps = {
  embeddedInTabShell?: boolean;
  nestedUnderSegment?: boolean;
  onBack?: () => void;
  /** Trial opened from a deep link or push tap. */
  focusTrialId?: string;
};

export function PlayerTrialsScreen({
  embeddedInTabShell = false,
  nestedUnderSegment = false,
  onBack,
  focusTrialId,
}: PlayerTrialsScreenProps) {
  const { t } = useAppTranslation(['trials', 'common']);
  const { trials, isLoading, isSaving, acceptTrial, declineTrial } = usePlayerTrialInvitations();
  const { notifications, markRead } = useTrialNotifications();
  const [activeTrial, setActiveTrial] = useState<TrialInvitation | null>(null);
  const [focusMissing, setFocusMissing] = useState(false);
  const handledFocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusTrialId || isLoading || handledFocusRef.current === focusTrialId) {
      return;
    }
    handledFocusRef.current = focusTrialId;
    const trial = trials.find((item) => item.id === focusTrialId);
    if (trial) {
      setActiveTrial(trial);
    } else {
      setFocusMissing(true);
    }
  }, [focusTrialId, isLoading, trials]);

  const screenProps = {
    ...(embeddedInTabShell ? { embeddedInTabShell: true as const } : {}),
    ...(nestedUnderSegment ? { safeAreaEdges: ['left', 'right'] as Array<'left' | 'right'> } : {}),
  };

  if (isLoading) {
    return (
      <Screen title={t('title')} subtitle={t('loadingSubtitle')} safeArea {...screenProps}>
        <SkeletonLoader variant="card" count={2} />
      </Screen>
    );
  }

  return (
    <Screen
      title={t('title')}
      subtitle={t('fullSubtitle')}
      scrollable
      safeArea
      {...screenProps}
      footer={
        onBack ? (
          <Button variant="secondary" onPress={onBack} fullWidth>
            {t('common:back')}
          </Button>
        ) : undefined
      }
    >
      <View className="gap-6">
        {focusMissing ? (
          <Card variant="outlined" padding="md" className="gap-1">
            <Text weight="semibold">{t('common:deepLink.not_found.title')}</Text>
            <Text variant="body-sm" color="secondary">
              {t('common:deepLink.not_found.body')}
            </Text>
          </Card>
        ) : null}
        {notifications.length > 0 ? (
          <Section title={t('notificationsTitle')} subtitle={t('notificationsSubtitle')}>
            <View className="gap-2">
              {notifications.slice(0, 5).map((notification) => (
                <NotificationCard
                  key={notification.id}
                  title={notification.title}
                  body={notification.body}
                  timestamp={new Date(notification.createdAt).toLocaleString()}
                  type="trial"
                  read={notification.read}
                  onPress={() => {
                    void markRead(notification.id);
                    const trial = trials.find((item) => item.id === notification.trialInvitationId);
                    if (trial) {
                      setActiveTrial(trial);
                    }
                  }}
                />
              ))}
            </View>
          </Section>
        ) : null}

        {trials.length === 0 ? (
          <EmptyState title={t('noInvitations')} description={t('noInvitationsDescriptionFull')} />
        ) : (
          <Section title={t('yourInvitations')}>
            <View className="gap-3">
              {trials.map((trial, index) => (
                <TrialInvitationCard
                  key={trial.id}
                  invitation={trial}
                  index={index}
                  onPress={setActiveTrial}
                />
              ))}
              {trials[0] ? <TrialReplayCard invitation={trials[0]} /> : null}
            </View>
          </Section>
        )}
      </View>

      <TrialInvitationResponseModal
        visible={activeTrial !== null}
        invitation={activeTrial}
        saving={isSaving}
        onClose={() => setActiveTrial(null)}
        onAccept={async (invitation, note) => {
          await acceptTrial(invitation, note);
        }}
        onDecline={async (invitation, note) => {
          await declineTrial(invitation, note);
        }}
      />
    </Screen>
  );
}

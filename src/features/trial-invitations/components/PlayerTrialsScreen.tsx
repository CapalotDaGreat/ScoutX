import { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Button } from '@/components/primitives/Button';
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

export type PlayerTrialsScreenProps = {
  embeddedInTabShell?: boolean;
  nestedUnderSegment?: boolean;
  onBack?: () => void;
};

export function PlayerTrialsScreen({
  embeddedInTabShell = false,
  nestedUnderSegment = false,
  onBack,
}: PlayerTrialsScreenProps) {
  const { trials, isLoading, isSaving, acceptTrial, declineTrial } = usePlayerTrialInvitations();
  const { notifications, markRead } = useTrialNotifications();
  const [activeTrial, setActiveTrial] = useState<TrialInvitation | null>(null);

  const screenProps = {
    ...(embeddedInTabShell ? { embeddedInTabShell: true as const } : {}),
    ...(nestedUnderSegment ? { safeAreaEdges: ['left', 'right'] as Array<'left' | 'right'> } : {}),
  };

  if (isLoading) {
    return (
      <Screen title="Trials" subtitle="Your recruitment invitations" safeArea {...screenProps}>
        <SkeletonLoader variant="card" count={2} />
      </Screen>
    );
  }

  return (
    <Screen
      title="Trials"
      subtitle="Accept, decline, and track professional trial invitations"
      scrollable
      safeArea
      {...screenProps}
      footer={
        onBack ? (
          <Button variant="secondary" onPress={onBack} fullWidth>
            Back
          </Button>
        ) : undefined
      }
    >
      <View className="gap-6">
        {notifications.length > 0 ? (
          <Section title="Notifications" subtitle="Trial updates for your account">
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
          <EmptyState
            title="No trial invitations"
            description="When scouts invite you to trials, they will appear here with full details and history."
          />
        ) : (
          <Section title="Your Invitations">
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

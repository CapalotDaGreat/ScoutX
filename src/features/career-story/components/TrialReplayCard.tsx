import { useMemo } from 'react';
import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { FreshnessLabel } from '@/components/evidence/FreshnessLabel';
import { buildTrialReplay } from '@/features/career-story/services/trialReplay';
import type { TrialInvitation } from '@/features/trial-invitations/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type TrialReplayCardProps = {
  invitation: TrialInvitation;
};

export function TrialReplayCard({ invitation }: TrialReplayCardProps) {
  const { t } = useAppTranslation(['trials']);
  const replay = useMemo(() => buildTrialReplay(invitation), [invitation]);
  const latestAt = replay.steps[replay.steps.length - 1]?.at ?? invitation.updatedAt;

  return (
    <Card variant="outlined" padding="md" className="gap-2">
      <Text variant="body" className="font-sans-semibold">
        {t('trials:replayTitle')}
      </Text>
      <Text variant="caption" color="secondary">
        {t('trials:replayLabel')}
      </Text>
      <FreshnessLabel updatedAt={latestAt} sampleSize={replay.steps.length} />
      {replay.steps.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('trials:replayEmpty')}
        </Text>
      ) : (
        <View className="gap-2">
          {replay.steps.map((step) => (
            <View key={step.id} className="gap-0.5">
              <Text variant="body-sm" className="font-sans-semibold">
                {step.action} · {step.at.slice(0, 10)}
              </Text>
              {step.note ? (
                <Text variant="caption" color="secondary">
                  {step.note}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { type PlayerProfile } from '@/features/player-profile/types';
import { buildLaunchReadinessReport } from '@/features/launch-readiness/services/launchReadinessService';
import { PushTokenRepository } from '@/features/notifications/repositories/PushTokenRepository';

export type LaunchReadinessCardProps = {
  playerId: string;
  profile: PlayerProfile;
};

export function LaunchReadinessCard({ playerId, profile }: LaunchReadinessCardProps) {
  const [pushRegistered, setPushRegistered] = useState(false);

  useEffect(() => {
    void PushTokenRepository.getInstance()
      .hasRegisteredToken(playerId)
      .then(setPushRegistered)
      .catch(() => setPushRegistered(false));
  }, [playerId]);

  const report = buildLaunchReadinessReport(profile, pushRegistered);
  const incomplete = report.items.filter((item) => !item.complete);

  if (report.score >= 100) {
    return (
      <Card variant="outlined" padding="md" className="gap-2">
        <Text variant="overline" color="secondary">
          Launch readiness
        </Text>
        <Text weight="semibold">Your Football Passport is release-ready</Text>
        <Text variant="body-sm" color="secondary">
          All pre-launch checks passed ({report.score}%).
        </Text>
      </Card>
    );
  }

  return (
    <Card variant="outlined" padding="md" className="gap-3">
      <Text variant="overline" color="secondary">
        Launch readiness
      </Text>
      <Text weight="semibold">Release checklist · {report.score}% complete</Text>
      <Text variant="body-sm" color="secondary">
        Complete these items before App Store / Play Store submission.
      </Text>
      <View className="gap-2">
        {incomplete.slice(0, 4).map((item) => (
          <View key={item.id} className="gap-0.5">
            <Text variant="body-sm" weight="semibold">
              ○ {item.label}
            </Text>
            <Text variant="caption" color="secondary">
              {item.hint}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

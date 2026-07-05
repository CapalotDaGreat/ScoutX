import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { Card } from '@/components/primitives/Card';
import { Badge } from '@/components/primitives/Badge';
import { Text } from '@/components/primitives/Text';
import { PushTokenRepository } from '@/features/notifications/repositories/PushTokenRepository';
import { type PlayerProfile } from '@/features/player-profile/types';
import { buildFootballPassportScoreReport } from '@/features/public-portfolio/services/footballPassportScoreService';
import { type TrustRecommendation } from '@/features/trust-system/types';

export type FootballPassportScoreCardProps = {
  playerId: string;
  profile: PlayerProfile;
  recommendations?: TrustRecommendation[];
};

function ProgressBar({ value }: { value: number }) {
  return (
    <View className="h-2 overflow-hidden rounded-full bg-background-secondary dark:bg-neutral-800">
      <View className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, value)}%` }} />
    </View>
  );
}

function SectionChecklist({
  items,
}: {
  items: ReturnType<typeof buildFootballPassportScoreReport>['sections'][number]['items'];
}) {
  return (
    <View className="gap-2">
      {items.map((item) => (
        <View key={item.id} className="flex-row items-start gap-2">
          <Text variant="body-sm">{item.complete ? '✔' : '○'}</Text>
          <View className="flex-1">
            <Text variant="body-sm" weight={item.complete ? 'regular' : 'semibold'}>
              {item.label}
            </Text>
            {!item.complete ? (
              <Text variant="caption" color="secondary">
                {item.hint}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

export function FootballPassportScoreCard({
  playerId,
  profile,
  recommendations = [],
}: FootballPassportScoreCardProps) {
  const [pushRegistered, setPushRegistered] = useState(false);

  useEffect(() => {
    void PushTokenRepository.getInstance()
      .hasRegisteredToken(playerId)
      .then(setPushRegistered)
      .catch(() => setPushRegistered(false));
  }, [playerId]);

  const report = useMemo(
    () => buildFootballPassportScoreReport(profile, recommendations, pushRegistered),
    [profile, pushRegistered, recommendations],
  );

  const launchSection = report.sections.find((section) => section.id === 'launchReady');
  const showLaunchSection = launchSection ? launchSection.score < 100 : false;

  return (
    <Card variant="outlined" padding="md" className="gap-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text variant="overline" color="secondary">
            Football Passport Score
          </Text>
          <Text weight="semibold" className="text-2xl">
            {report.overallScore} / 100
          </Text>
          <Text variant="caption" color="secondary">
            Grade {report.grade} · One score, four clear areas to improve
          </Text>
        </View>
        <Badge variant="accent" label={`Grade ${report.grade}`} />
      </View>

      <ProgressBar value={report.overallScore} />

      {report.focusHints.length > 0 ? (
        <View className="gap-1">
          <Text variant="caption" color="secondary">
            Focus next
          </Text>
          {report.focusHints.map((hint) => (
            <Text key={hint} variant="body-sm">
              • {hint}
            </Text>
          ))}
        </View>
      ) : null}

      {report.sections
        .filter((section) => section.id !== 'launchReady' || showLaunchSection)
        .map((section) => (
          <CollapsibleSection
            key={section.id}
            title={`${section.title} · ${section.score}%`}
            subtitle={section.subtitle}
            defaultOpen={section.score < 100 && section.id !== 'launchReady'}
          >
            <ProgressBar value={section.score} />
            <SectionChecklist items={section.items} />
          </CollapsibleSection>
        ))}
    </Card>
  );
}

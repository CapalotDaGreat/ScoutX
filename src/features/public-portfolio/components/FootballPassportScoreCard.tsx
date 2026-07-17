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
import {
  resolveProgressAccentColor,
  resolveProgressAccentMuted,
  resolveProgressBadgeVariant,
} from '@/theme';
import { useTheme } from '@/theme';

export type FootballPassportScoreCardProps = {
  playerId: string;
  profile: PlayerProfile;
  recommendations?: TrustRecommendation[];
};

function ProgressBar({
  value,
  fillColor,
  trackColor,
}: {
  value: number;
  fillColor: string;
  trackColor: string;
}) {
  return (
    <View
      className="h-2 overflow-hidden rounded-full"
      style={{ backgroundColor: trackColor }}
    >
      <View
        className="h-full rounded-full"
        style={{ width: `${Math.min(100, value)}%`, backgroundColor: fillColor }}
      />
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
            <Text variant="body-sm" weight={item.complete ? 'regular' : 'medium'}>
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
  const { colors } = useTheme();
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

  const progressColor = resolveProgressAccentColor(colors, report.overallScore);
  const progressTrack = resolveProgressAccentMuted(colors, report.overallScore);
  const badgeVariant = resolveProgressBadgeVariant(report.overallScore);

  const completeSection = report.sections.find((section) => section.id === 'complete');
  const scoutSection = report.sections.find((section) => section.id === 'scoutVisible');
  const discoverableItem = scoutSection?.items.find((item) => item.id === 'discoverable');
  const coachItem = scoutSection?.items.find((item) => item.id === 'coach');
  const launchSection = report.sections.find((section) => section.id === 'launchReady');
  const showLaunchSection = launchSection ? launchSection.score < 100 : false;

  return (
    <Card variant="prestige" padding="md" className="gap-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text variant="overline" color="secondary">
            Football Passport Score
          </Text>
          <Text weight="semibold" className="text-2xl" style={{ color: progressColor }}>
            {report.overallScore} / 100
          </Text>
          <Text variant="caption" color="secondary">
            Grade {report.grade} · One readiness score with clear sub-areas
          </Text>
        </View>
        <Badge variant={badgeVariant} label={`Grade ${report.grade}`} />
      </View>

      <ProgressBar
        value={report.overallScore}
        fillColor={progressColor}
        trackColor={progressTrack}
      />

      <View className="flex-row flex-wrap gap-2">
        <Badge
          variant={completeSection && completeSection.score >= 70 ? 'prestige' : 'outline'}
          label={`Profile ${completeSection?.score ?? 0}%`}
          size="sm"
        />
        <Badge
          variant={discoverableItem?.complete ? 'prestige' : 'outline'}
          label={discoverableItem?.complete ? 'Discoverable' : 'Not discoverable'}
          size="sm"
        />
        <Badge
          variant={coachItem?.complete ? 'prestige' : 'outline'}
          label={coachItem?.complete ? 'Coach endorsed' : 'Needs coach'}
          size="sm"
        />
      </View>

      {report.focusHints.length > 0 ? (
        <View className="gap-1">
          <Text variant="caption" color="secondary">
            Focus next
          </Text>
          {report.focusHints.slice(0, 2).map((hint) => (
            <Text key={hint} variant="body-sm">
              • {hint}
            </Text>
          ))}
        </View>
      ) : null}

      {report.sections
        .filter((section) => section.id !== 'launchReady' || showLaunchSection)
        .map((section) => {
          const sectionColor = resolveProgressAccentColor(colors, section.score);
          const sectionTrack = resolveProgressAccentMuted(colors, section.score);
          return (
            <CollapsibleSection
              key={section.id}
              title={`${section.title} · ${section.score}%`}
              subtitle={section.subtitle}
              defaultOpen={false}
              persistKey={`passport-score-${section.id}`}
            >
              <ProgressBar
                value={section.score}
                fillColor={sectionColor}
                trackColor={sectionTrack}
              />
              <SectionChecklist items={section.items} />
            </CollapsibleSection>
          );
        })}
    </Card>
  );
}

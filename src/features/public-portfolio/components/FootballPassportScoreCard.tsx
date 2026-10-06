import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { PushTokenRepository } from '@/features/notifications/repositories/PushTokenRepository';
import {
  DiscoverabilityHealthCard,
  EvidenceCoverageGrid,
  EvidenceGapsCard,
  PassportCoachCard,
  ProofStack,
  ReadinessList,
} from '@/features/passport/components/PassportEvidence';
import { GpsSessionRepository } from '@/features/gps/repositories/GpsSessionRepository';
import { findEvidenceGaps } from '@/features/intelligence/services/evidenceGaps';
import { buildPassportSummary } from '@/features/passport/services/passportSummaryService';
import { type PlayerProfile } from '@/features/player-profile/types';
import { type TrustRecommendation } from '@/features/trust-system/types';
import { hasPrivacyPolicyUrl, hasTermsOfServiceUrl } from '@/config/legal';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type FootballPassportScoreCardProps = {
  playerId: string;
  profile: PlayerProfile;
  recommendations?: TrustRecommendation[];
};

export function FootballPassportScoreCard({
  playerId,
  profile,
  recommendations = [],
}: FootballPassportScoreCardProps) {
  const { t } = useAppTranslation(['passport']);
  const [pushRegistered, setPushRegistered] = useState(false);
  const [gpsSessionCount, setGpsSessionCount] = useState(0);

  useEffect(() => {
    void PushTokenRepository.getInstance()
      .hasRegisteredToken(playerId)
      .then(setPushRegistered)
      .catch(() => setPushRegistered(false));
    void GpsSessionRepository.getInstance()
      .fetchSessions(playerId)
      .then((sessions) => setGpsSessionCount(sessions.length))
      .catch(() => setGpsSessionCount(0));
  }, [playerId]);

  const summary = useMemo(
    () =>
      buildPassportSummary({
        profile,
        recommendations,
        pushRegistered,
        gpsSessionCount,
        legalPagesReady: hasPrivacyPolicyUrl() && hasTermsOfServiceUrl(),
      }),
    [gpsSessionCount, profile, pushRegistered, recommendations],
  );

  const gaps = useMemo(
    () =>
      findEvidenceGaps({
        identity: profile.identity,
        matches: profile.statisticsMatches ?? [],
        coachEndorsementCount: recommendations.filter((item) => item.authorRole === 'coach').length,
      }),
    [profile.identity, profile.statisticsMatches, recommendations],
  );

  return (
    <Card variant="prestige" padding="md" className="gap-4">
      <DiscoverabilityHealthCard summary={summary} />
      <PassportCoachCard summary={summary} />
      <EvidenceGapsCard gaps={gaps} />

      <CollapsibleSection title={t('passport:proof.title')} defaultOpen persistKey="passport-proof">
        <ProofStack items={summary.proof} />
      </CollapsibleSection>

      <CollapsibleSection
        title={t('passport:readiness.evidenceTitle')}
        defaultOpen
        persistKey="passport-coverage"
      >
        <EvidenceCoverageGrid coverage={summary.coverage} />
        <View className="mt-3">
          <ReadinessList items={summary.readiness} group="evidence" />
        </View>
      </CollapsibleSection>

      <CollapsibleSection title={t('passport:readiness.sharingTitle')} persistKey="passport-sharing">
        <ReadinessList items={summary.readiness} group="sharing" />
      </CollapsibleSection>

      <CollapsibleSection
        title={t('passport:readiness.appOpsTitle')}
        subtitle={t('passport:readiness.appOpsHint')}
        persistKey="passport-appops"
      >
        <ReadinessList items={summary.readiness} group="app_ops" />
      </CollapsibleSection>
    </Card>
  );
}

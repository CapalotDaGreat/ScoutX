import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import type {
  ShortlistIntelligence,
  WhyNotReason,
} from '@/features/scout-intelligence/services/scoutDecisionSupport';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export function WhyNotCard({ reasons }: { reasons: readonly WhyNotReason[] }) {
  const { t } = useAppTranslation(['scout']);
  return (
    <Card variant="outlined" padding="md" className="gap-1.5">
      <Text variant="body" className="font-sans-semibold" accessibilityRole="header">
        {t('scout:intelligence.whyNotTitle')}
      </Text>
      {reasons.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('scout:intelligence.whyNotEmpty')}
        </Text>
      ) : (
        reasons.map((reason) => (
          <Text key={reason.code} variant="body-sm">
            {'• '}
            {t(`scout:intelligence.whyNot.${reason.code}`, { count: reason.count ?? 0, days: reason.days ?? 0 })}
          </Text>
        ))
      )}
    </Card>
  );
}

export function ShortlistIntelligenceCard({ intelligence }: { intelligence: ShortlistIntelligence }) {
  const { t } = useAppTranslation(['scout', 'passport']);
  const { strongest, biggestUncertainty, changesSinceReview, briefFit, nextAction } = intelligence;
  return (
    <Card variant="outlined" padding="md" className="gap-1.5" testID="shortlist-intelligence">
      <Text variant="body" className="font-sans-semibold" accessibilityRole="header">
        {t('scout:intelligence.shortlist.title')}
      </Text>
      <Text variant="body-sm">
        {strongest
          ? t('scout:intelligence.shortlist.strongest', {
              dimension: t(`passport:coverage.${strongest.dimension}`),
              state: t(`scout:intelligence.coverageState.${strongest.state}`),
            })
          : t('scout:intelligence.shortlist.noStrongest')}
      </Text>
      {biggestUncertainty ? (
        <Text variant="body-sm" color="secondary">
          {biggestUncertainty.kind === 'coverage'
            ? t('scout:intelligence.shortlist.uncertaintyCoverage', {
                dimension: t(`passport:coverage.${biggestUncertainty.dimension}`),
              })
            : t('scout:intelligence.shortlist.uncertaintyBrief', { count: biggestUncertainty.count })}
        </Text>
      ) : null}
      <Text variant="body-sm" color="secondary">
        {changesSinceReview > 0
          ? t('scout:intelligence.shortlist.changes', { count: changesSinceReview })
          : t('scout:intelligence.shortlist.noChanges')}
      </Text>
      {briefFit ? (
        <Text variant="body-sm" color="secondary">
          {t('scout:intelligence.shortlist.fit', briefFit)}
        </Text>
      ) : null}
      <View className="mt-1 rounded-lg bg-accent-muted px-3 py-2">
        <Text variant="body-sm" weight="semibold">
          {t('scout:intelligence.shortlist.next', {
            action: t(`scout:intelligence.shortlist.actions.${nextAction}`),
          })}
        </Text>
      </View>
    </Card>
  );
}

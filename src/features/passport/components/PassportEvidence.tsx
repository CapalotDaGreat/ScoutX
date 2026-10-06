import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { EvidenceStateBadge } from '@/components/evidence/EvidenceStateBadge';
import { ProvenanceBadge } from '@/components/evidence/ProvenanceBadge';
import type { CoverageState } from '@/features/development/types';
import type { EvidenceCoverage, PassportSummary, ProofItem, ReadinessItem } from '@/features/passport/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

type Translate = ReturnType<typeof useAppTranslation>['t'];

function coverageToEvidenceState(state: CoverageState): 'available' | 'partial' | 'insufficient' {
  if (state === 'strong' || state === 'moderate') return 'available';
  if (state === 'limited') return 'partial';
  return 'insufficient';
}

function dimensionLabel(t: Translate, id: EvidenceCoverage['id']): string {
  switch (id) {
    case 'technical':
      return t('passport:coverage.technical');
    case 'tactical':
      return t('passport:coverage.tactical');
    case 'physical':
      return t('passport:coverage.physical');
    case 'consistency':
      return t('passport:coverage.consistency');
    case 'video':
      return t('passport:coverage.video');
  }
}

function statusMark(status: ReadinessItem['status']): string {
  if (status === 'ready') return '✔';
  if (status === 'partial') return '◐';
  return '○';
}

export function ProofStack({ items }: { items: ProofItem[] }) {
  const { t, i18n } = useAppTranslation(['passport']);
  if (items.length === 0) {
    return (
      <Text variant="caption" color="secondary">
        {t('passport:proof.empty')}
      </Text>
    );
  }
  return (
    <View className="gap-2">
      {items.map((item) => {
        const dateLabel = item.occurredAt && !Number.isNaN(Date.parse(item.occurredAt))
          ? new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(new Date(item.occurredAt))
          : t('passport:proof.dateUnknown');
        return (
          <View key={item.id} className="flex-row items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <View className="min-w-0 flex-1">
              <Text weight="semibold" numberOfLines={1}>
                {item.title}
              </Text>
              <Text variant="caption" color="secondary" numberOfLines={2}>
                {item.detail} · {dateLabel}
              </Text>
            </View>
            <ProvenanceBadge provenance={item.provenance} />
          </View>
        );
      })}
    </View>
  );
}

export function EvidenceCoverageGrid({ coverage }: { coverage: EvidenceCoverage[] }) {
  const { t } = useAppTranslation(['passport']);
  return (
    <View className="gap-2">
      {coverage.map((item) => (
        <View key={item.id} className="flex-row items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <View className="min-w-0 flex-1">
            <Text weight="semibold">{dimensionLabel(t, item.id)}</Text>
            <Text variant="caption" color="secondary">
              {t('passport:coverage.sample', { have: item.sampleSize, need: item.requiredForStrong })}
            </Text>
          </View>
          <EvidenceStateBadge state={coverageToEvidenceState(item.state)} />
        </View>
      ))}
    </View>
  );
}

export function ReadinessList({ items, group }: { items: ReadinessItem[]; group: ReadinessItem['group'] }) {
  const filtered = items.filter((item) => item.group === group);
  return (
    <View className="gap-2">
      {filtered.map((item) => (
        <View key={item.id} className="flex-row items-start gap-2">
          <Text variant="body-sm">{statusMark(item.status)}</Text>
          <View className="flex-1">
            <Text variant="body-sm" weight={item.status === 'ready' ? 'regular' : 'medium'}>
              {item.label}
            </Text>
            <Text variant="caption" color="secondary">
              {item.reason}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function PassportCoachCard({ summary }: { summary: PassportSummary }) {
  const { t } = useAppTranslation(['passport']);
  if (summary.coachTips.length === 0) {
    return (
      <Card variant="default" padding="sm">
        <Text color="secondary">{t('passport:coach.caughtUp')}</Text>
      </Card>
    );
  }
  return (
    <Card variant="default" padding="sm" className="gap-2">
      <Text variant="overline" color="secondary">
        {t('passport:coach.title')}
      </Text>
      {summary.coachTips.map((tip) => (
        <View key={tip.id} className="gap-0.5">
          <Text weight="semibold">{tip.title}</Text>
          <Text variant="caption" color="secondary">
            {tip.reason}
          </Text>
        </View>
      ))}
    </Card>
  );
}

export function DiscoverabilityHealthCard({ summary }: { summary: PassportSummary }) {
  const { t } = useAppTranslation(['passport']);
  const { discoverability } = summary;
  return (
    <Card variant="default" padding="sm" className="gap-2">
      <Text variant="overline" color="secondary">
        {t('passport:discoverability.title')}
      </Text>
      <Text weight="semibold">
        {discoverability.discoverable && discoverability.publicPassport
          ? t('passport:discoverability.visible')
          : t('passport:discoverability.hidden')}
      </Text>
      <Text variant="caption" color="secondary">
        {t('passport:discoverability.counts', {
          matches: discoverability.matchCount,
          videos: discoverability.videoCount,
        })}
      </Text>
      {discoverability.blockers.map((blocker) => (
        <Text key={blocker} variant="caption" color="warning">
          {blocker === 'public_passport_off'
            ? t('passport:discoverability.blockers.public_passport_off')
            : blocker === 'discovery_opt_in_off'
              ? t('passport:discoverability.blockers.discovery_opt_in_off')
              : t('passport:discoverability.blockers.no_matches')}
        </Text>
      ))}
    </Card>
  );
}

import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import type { BriefCriterion, BriefMatch } from '@/features/scout-intelligence/services/briefMatch';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

type Translate = ReturnType<typeof useAppTranslation>['t'];

export type BriefMatchCardProps = {
  match: BriefMatch;
};

function valueLabel(t: Translate, criterion: BriefCriterion, value: string): string {
  if (criterion.id === 'foot') {
    if (value === 'left') return t('scout:filters.left');
    if (value === 'right') return t('scout:filters.right');
    if (value === 'both') return t('scout:filters.both');
  }
  if (criterion.id === 'availability') {
    if (value === 'available') return t('scout:filters.available');
    if (value === 'unavailable') return t('scout:filters.unavailable');
    if (value === 'on_loan') return t('scout:filters.onLoan');
  }
  return value;
}

function criterionLine(t: Translate, criterion: BriefCriterion): string {
  const label = t(`scout:brief.criteria.${criterion.id}`);
  if (criterion.result === 'unknown' || !criterion.wanted) {
    return label;
  }
  return t('scout:brief.wantedVsActual', {
    label,
    wanted: valueLabel(t, criterion, criterion.wanted),
    actual: valueLabel(t, criterion, criterion.actual) || '—',
  });
}

/** How a player fits the scout's own saved brief, including why not and what is unknown. */
export function BriefMatchCard({ match }: BriefMatchCardProps) {
  const { t } = useAppTranslation(['scout']);
  const misses = match.criteria.filter((item) => item.result === 'not_met');
  const unknowns = match.criteria.filter((item) => item.result === 'unknown');

  return (
    <Card variant="outlined" padding="md" className="gap-2">
      <Text variant="body" className="font-sans-semibold" accessibilityRole="header">
        {t('scout:brief.title', { name: match.presetName })}
      </Text>
      <Text variant="body-sm" color="secondary">
        {t('scout:brief.summary', { met: match.met, total: match.criteria.length })}
      </Text>
      {misses.length > 0 ? (
        <View className="gap-0.5">
          <Text variant="caption" weight="semibold">
            {t('scout:brief.whyNot')}
          </Text>
          {misses.map((item) => (
            <Text key={item.id} variant="body-sm">
              {criterionLine(t, item)}
            </Text>
          ))}
        </View>
      ) : null}
      {unknowns.length > 0 ? (
        <View className="gap-0.5">
          <Text variant="caption" weight="semibold">
            {t('scout:brief.unknown')}
          </Text>
          <Text variant="body-sm" color="secondary">
            {unknowns.map((item) => t(`scout:brief.criteria.${item.id}`)).join(' · ')}
          </Text>
          <Text variant="caption" color="tertiary">
            {t('scout:brief.unknownHint')}
          </Text>
        </View>
      ) : null}
      {misses.length === 0 && unknowns.length === 0 ? (
        <Text variant="body-sm">{t('scout:brief.allMet')}</Text>
      ) : null}
    </Card>
  );
}

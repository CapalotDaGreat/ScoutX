import { Text } from '@/components/primitives/Text';
import { formatFreshness, type FreshnessInput } from '@/components/evidence/freshness';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type FreshnessLabelProps = FreshnessInput & {
  className?: string;
};

export function FreshnessLabel({ className, ...input }: FreshnessLabelProps) {
  const { t } = useAppTranslation(['evidence']);
  const freshness = formatFreshness(input);
  if (!freshness.known) {
    return (
      <Text variant="caption" color="secondary" className={className}>
        {t('evidence:freshness.unknown')}
      </Text>
    );
  }
  const days =
    freshness.daysAgo === 0
      ? t('evidence:freshness.today')
      : t('evidence:freshness.daysAgo', { count: freshness.daysAgo ?? 0 });
  const sample =
    freshness.sampleSize !== null
      ? t('evidence:freshness.sample', { count: freshness.sampleSize })
      : null;
  return (
    <Text variant="caption" color="secondary" className={className}>
      {[days, sample].filter(Boolean).join(' · ')}
    </Text>
  );
}

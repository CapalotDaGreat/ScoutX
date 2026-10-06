import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import type { ScoutBrief } from '@/features/scout-intelligence/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ScoutBriefCardProps = {
  brief: ScoutBrief;
};

export function ScoutBriefCard({ brief }: ScoutBriefCardProps) {
  const { t } = useAppTranslation(['scout']);

  return (
    <Card variant="outlined" padding="md" className="gap-2">
      <Text variant="body" className="font-sans-semibold">{t('scout:intelligence.briefTitle')}</Text>
      <Text variant="body-sm">{brief.headline}</Text>
      <Text variant="caption" color="secondary">
        {t(`scout:intelligence.recommendation.${brief.recommendation}`)}
      </Text>
      {brief.gaps.length > 0 ? (
        <Text variant="caption" color="secondary">
          {t('scout:intelligence.gaps', { gaps: brief.gaps.join(', ') })}
        </Text>
      ) : null}
    </Card>
  );
}

import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { type AnalysisPreview } from '@/features/match-analysis/services/analysisPreviewService';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

const mbps = (bitsPerSecond: number) => (bitsPerSecond / 1_000_000).toFixed(1);

/**
 * Preflight from file metadata only. Measured facts and what they may mean are shown
 * separately; warnings never stop an analysis.
 */
export function AnalysisPreviewCard({ preview, loading }: { preview: AnalysisPreview; loading?: boolean }) {
  const { t } = useAppTranslation('matchAnalysis');
  const { facts } = preview;
  const measured = [
    facts.width && facts.height ? t('preview.fact.resolution', { width: facts.width, height: facts.height }) : null,
    facts.frameRate ? t('preview.fact.frameRate', { fps: Math.round(facts.frameRate) }) : null,
    facts.bitrate
      ? t(facts.bitrateSource === 'track' ? 'preview.fact.bitrate' : 'preview.fact.bitrateAverage', { mbps: mbps(facts.bitrate) })
      : null,
  ].filter((item): item is string => item !== null);

  return (
    <Card padding="lg" className="gap-2" testID="analysis-preflight">
      <Heading level={3}>{t('preview.title')}</Heading>
      {preview.blockers.map((item) => (
        <Text key={item} variant="body-sm" color="error">
          {t(`preview.blocker.${item}`)}
        </Text>
      ))}
      <Text variant="caption" weight="semibold">
        {t('preview.measuredTitle')}
      </Text>
      <Text variant="body-sm" color="secondary">
        {loading ? t('preview.reading') : measured.length > 0 ? measured.join(' · ') : t('preview.noMetadata')}
      </Text>
      {preview.warnings.length > 0 ? (
        <View className="gap-1">
          <Text variant="caption" weight="semibold">
            {t('preview.mayAffectTitle')}
          </Text>
          {preview.warnings.map((item) => (
            <Text key={item} variant="body-sm" color="secondary">
              {t(`preview.warning.${item}`)}
            </Text>
          ))}
        </View>
      ) : null}
      <Text variant="caption" color="tertiary">
        {t('preview.notChecked')}
      </Text>
      <Text variant="caption" color="tertiary">
        {t('preview.advisory')}
      </Text>
      <Text variant="caption" color="secondary">
        {t('preview.cvUnavailable')}
      </Text>
    </Card>
  );
}

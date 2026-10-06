import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { type AnalysisPreview } from '@/features/match-analysis/services/analysisPreviewService';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export function AnalysisPreviewCard({ preview }: { preview: AnalysisPreview }) {
  const { t } = useAppTranslation('matchAnalysis');
  return (
    <Card padding="lg" className="gap-2">
      <Heading level={3}>{t('preview.title')}</Heading>
      <Text variant="body-sm">
        {t('preview.quality')}: {t(`band.${preview.quality}`)}
      </Text>
      <Text variant="caption" color="secondary">
        {t('preview.frames', { count: preview.preprocessing.sampledFrameCount })}
      </Text>
      {preview.blockers.map((item) => (
        <Text key={item} variant="body-sm" color="error">
          {item}
        </Text>
      ))}
      {preview.preprocessing.warnings.map((item) => (
        <Text key={item} variant="body-sm" color="secondary">
          {item}
        </Text>
      ))}
      <View>
        <Text variant="caption" color="secondary">
          {t('preview.cvUnavailable')}
        </Text>
      </View>
    </Card>
  );
}

import { useMemo } from 'react';
import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { buildAnalysisTrends } from '@/features/match-analysis/services/analysisTrends';
import type { MatchAnalysisJob } from '@/features/match-analysis/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

type Props = { jobs: readonly MatchAnalysisJob[] };

/** Star ratings across the player's own analyses, only once enough comparable ones exist. */
export function AnalysisTrendsCard({ jobs }: Props) {
  const { t } = useAppTranslation('matchAnalysis');
  const trends = useMemo(() => buildAnalysisTrends(jobs), [jobs]);

  if (trends.state === 'locked') {
    if (trends.completed === 0) return null;
    return (
      <Card testID="analysis-trends-locked">
        <View className="gap-1">
          <Heading level={3}>{t('trends.title')}</Heading>
          <Text variant="caption" color="secondary">
            {t('trends.locked', { completed: trends.completed, required: trends.required })}
          </Text>
        </View>
      </Card>
    );
  }

  return (
    <Card testID="analysis-trends">
      <View className="gap-2">
        <Heading level={3}>{t('trends.title')}</Heading>
        <Text variant="caption" color="secondary">
          {t(`trends.kind.${trends.kind}`, { count: trends.completed })}
        </Text>
        {trends.series.map((series) => (
          <View key={series.metric} className="gap-0.5" testID={`trend-${series.metric}`}>
            <Text variant="body">
              {t('trends.row', {
                metric: t(`technique.dimensions.${series.metric}`),
                values: series.points.map((point) => (point.value === null ? '–' : String(point.value))).join(' · '),
              })}
            </Text>
            <Text variant="caption" color="tertiary">
              {t(`trends.source.${series.source}`)} · {t('trends.measured', { measured: series.measured, total: series.points.length })}
            </Text>
          </View>
        ))}
        {trends.unknownMetrics.length > 0 ? (
          <Text variant="caption" color="secondary">
            {t('trends.unknown', { metrics: trends.unknownMetrics.map((metric) => t(`technique.dimensions.${metric}`)).join(', ') })}
          </Text>
        ) : null}
        <Text variant="caption" color="tertiary">
          {t('trends.caveat')}
        </Text>
      </View>
    </Card>
  );
}

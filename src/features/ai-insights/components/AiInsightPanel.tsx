import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Text } from '@/components/primitives/Text';
import { Section } from '@/components/layout/Section';
import { AiInsightCard } from '@/features/ai-insights/components/AiInsightCard';
import { AiRecommendationList } from '@/features/ai-insights/components/AiRecommendationList';
import { useAiInsight } from '@/features/ai-insights/hooks/useAiInsight';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import {
  type AiInsight,
  type AiInsightContext,
  type AiInsightType,
} from '@/features/ai-insights/types';

export type AiInsightPanelProps = {
  insightType: AiInsightType;
  context: AiInsightContext | null;
  enabled?: boolean;
  autoGenerate?: boolean;
};

type Translate = ReturnType<typeof useAppTranslation>['t'];

function renderInsightBody(insight: AiInsight, t: Translate) {
  switch (insight.type) {
    case 'performance_summary':
      return (
        <>
          <Text variant="body-sm">{insight.narrative}</Text>
          {insight.highlights.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {insight.highlights.map((highlight) => (
                <View
                  key={`${highlight.label}-${highlight.value}`}
                  className="rounded-lg border border-border px-3 py-2"
                >
                  <Text variant="caption" color="secondary">
                    {highlight.label}
                  </Text>
                  <Text variant="body-sm" className="font-sans-semibold">
                    {highlight.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      );

    case 'improvement_suggestions':
      return (
        <>
          {insight.focusAreas.length > 0 ? (
            <Text variant="caption" color="secondary">
              {t('statistics:aiInsight.focus', { items: insight.focusAreas.join(' · ') })}
            </Text>
          ) : null}
          <AiRecommendationList items={insight.suggestions} />
        </>
      );

    case 'training_recommendations':
      return (
        <>
          {insight.weeklyFocus ? (
            <Text variant="body-sm" className="font-sans-semibold">
              {t('statistics:aiInsight.weeklyFocus', { focus: insight.weeklyFocus })}
            </Text>
          ) : null}
          <AiRecommendationList items={insight.drills} title={t('statistics:aiInsight.drills')} />
        </>
      );

    case 'potential_analysis':
      return (
        <>
          {insight.currentRating !== null ||
          insight.potentialRating !== null ||
          insight.trajectory !== null ? (
            <Text variant="body-sm">
              {[
                insight.currentRating !== null
                  ? t('statistics:aiInsight.current', { value: insight.currentRating })
                  : null,
                insight.potentialRating !== null
                  ? t('statistics:aiInsight.potential', { value: insight.potentialRating })
                  : null,
                insight.trajectory !== null
                  ? t('statistics:aiInsight.trajectory', { value: insight.trajectory })
                  : null,
              ]
                .filter((part): part is string => part !== null)
                .join(' · ')}
            </Text>
          ) : null}
          <Text variant="body-sm">{insight.scoutNotes}</Text>
          {insight.growthAreas.length > 0 ? (
            <Text variant="caption" color="secondary">
              {t('statistics:aiInsight.growthAreas', { items: insight.growthAreas.join(', ') })}
            </Text>
          ) : null}
        </>
      );

    case 'career_progression_summary':
      return (
        <>
          {insight.milestones.map((milestone) => (
            <View key={`${milestone.title}-${milestone.period}`} className="gap-0.5">
              <Text variant="body-sm" className="font-sans-semibold">
                {milestone.title}
              </Text>
              <Text variant="caption" color="secondary">
                {milestone.period} — {milestone.significance}
              </Text>
            </View>
          ))}
          {insight.nextSteps.length > 0 ? (
            <Text variant="caption" color="secondary">
              {t('statistics:aiInsight.nextSteps', { items: insight.nextSteps.join(' · ') })}
            </Text>
          ) : null}
        </>
      );

    case 'video_summary':
      return (
        <>
          {insight.keyMoments.map((moment, index) => (
            <Text key={`${moment.timestamp ?? 'no-ts'}-${index}`} variant="body-sm">
              {moment.timestamp ? `${moment.timestamp} — ${moment.description}` : moment.description}
            </Text>
          ))}
          <Text variant="caption" color="secondary">
            {t('statistics:aiInsight.strengths', { items: insight.strengthsShown.join(', ') })}
          </Text>
          <Text variant="caption" color="secondary">
            {t('statistics:aiInsight.improve', { items: insight.areasToImprove.join(', ') })}
          </Text>
        </>
      );

    case 'gps_summary':
      return (
        <>
          <Text variant="body-sm">{insight.movementProfile}</Text>
          {insight.metrics.map((metric) => (
            <Text key={`${metric.label}-${metric.value}`} variant="caption" color="secondary">
              {metric.label}: {metric.value}
            </Text>
          ))}
          <Text variant="caption" color="secondary">
            {insight.tacticalInsights.join(' · ')}
          </Text>
        </>
      );

    default:
      return null;
  }
}

export function AiInsightPanel({
  insightType,
  context,
  enabled = true,
  autoGenerate = true,
}: AiInsightPanelProps) {
  const { t } = useAppTranslation(['statistics', 'common']);
  const { insight, isLoading, error, isLive, providerLabel, regenerate } = useAiInsight(
    insightType,
    context,
    { enabled, autoGenerate },
  );

  if (!enabled || !context) {
    return null;
  }

  return (
    <Section
      title={t(`statistics:aiInsight.type.${insightType}.title`)}
      subtitle={t(`statistics:aiInsight.type.${insightType}.description`)}
      action={
        <Button variant="ghost" size="sm" onPress={regenerate} disabled={isLoading}>
          {t('common:refresh')}
        </Button>
      }
    >
      {isLoading && !insight ? <SkeletonLoader variant="card" count={1} /> : null}

      {error ? (
        <View className="gap-2">
          <Text variant="body-sm" color="secondary">
            {error}
          </Text>
          <Button variant="secondary" size="sm" onPress={regenerate}>
            {t('common:retry')}
          </Button>
        </View>
      ) : null}

      {insight ? (
        <AiInsightCard insight={insight} isLive={isLive} providerLabel={providerLabel}>
          {renderInsightBody(insight, t)}
        </AiInsightCard>
      ) : null}
    </Section>
  );
}

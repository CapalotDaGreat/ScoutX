import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Text } from '@/components/primitives/Text';
import { Section } from '@/components/layout/Section';
import { AiInsightCard } from '@/features/ai-insights/components/AiInsightCard';
import { AiRecommendationList } from '@/features/ai-insights/components/AiRecommendationList';
import { AI_INSIGHT_DESCRIPTIONS, AI_INSIGHT_LABELS } from '@/features/ai-insights/constants';
import { useAiInsight } from '@/features/ai-insights/hooks/useAiInsight';
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

function renderInsightBody(insight: AiInsight) {
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
              Focus: {insight.focusAreas.join(' · ')}
            </Text>
          ) : null}
          <AiRecommendationList items={insight.suggestions} />
        </>
      );

    case 'training_recommendations':
      return (
        <>
          <Text variant="body-sm" className="font-sans-semibold">
            Weekly focus: {insight.weeklyFocus}
          </Text>
          <AiRecommendationList items={insight.drills} title="Recommended drills" />
        </>
      );

    case 'potential_analysis':
      return (
        <>
          <Text variant="body-sm">
            Current {insight.currentRating} · Potential {insight.potentialRating} · Trajectory{' '}
            {insight.trajectory}
          </Text>
          <Text variant="body-sm">{insight.scoutNotes}</Text>
          {insight.growthAreas.length > 0 ? (
            <Text variant="caption" color="secondary">
              Growth areas: {insight.growthAreas.join(', ')}
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
              Next steps: {insight.nextSteps.join(' · ')}
            </Text>
          ) : null}
        </>
      );

    case 'video_summary':
      return (
        <>
          {insight.keyMoments.map((moment) => (
            <Text key={`${moment.timestamp}-${moment.description}`} variant="body-sm">
              {moment.timestamp} — {moment.description}
            </Text>
          ))}
          <Text variant="caption" color="secondary">
            Strengths: {insight.strengthsShown.join(', ')}
          </Text>
          <Text variant="caption" color="secondary">
            Improve: {insight.areasToImprove.join(', ')}
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
      title={AI_INSIGHT_LABELS[insightType]}
      subtitle={AI_INSIGHT_DESCRIPTIONS[insightType]}
      action={
        <Button variant="ghost" size="sm" onPress={regenerate} disabled={isLoading}>
          Refresh
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
            Try again
          </Button>
        </View>
      ) : null}

      {insight ? (
        <AiInsightCard insight={insight} isLive={isLive} providerLabel={providerLabel}>
          {renderInsightBody(insight)}
        </AiInsightCard>
      ) : null}
    </Section>
  );
}

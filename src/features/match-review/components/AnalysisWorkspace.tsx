import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { formatClock } from '@/features/match-analysis/services/trackingPresentation';
import { useReviewT } from '../hooks/useReviewT';
import { roundEstimate, type Journey, type JourneyProblem, type StageStatus } from '../services/journey';

/** Status glyphs carry meaning without colour; the text label is read by screen readers. */
const GLYPH: Record<StageStatus, string> = { done: '✓', active: '●', pending: '○', blocked: '!' };

export type AnalysisWorkspaceProps = {
  journey: Journey;
  onProblemAction?: (action: JourneyProblem['action']) => void;
  busy?: boolean;
  number?: string | null;
};

/**
 * The processing workspace. Never blocks: the user can leave at any time, early results unlock
 * as they arrive, and every progress statement maps to persisted processing facts.
 */
export function AnalysisWorkspace({ journey, onProblemAction, busy, number }: AnalysisWorkspaceProps) {
  const t = useReviewT();
  const { parts, remainingSec, problem } = journey;
  const estimate = remainingSec !== null ? roundEstimate(remainingSec) : null;
  return (
    <Card padding="lg" className="gap-3" testID="analysis-workspace">
      <Heading level={3}>{t('review.workspace.title')}</Heading>
      {!journey.complete ? <Text variant="body-sm" color="secondary">{t('review.workspace.intro')}</Text> : null}
      <View className="gap-1" accessibilityRole="list">
        {journey.stages.map((stage) => (
          <View key={stage.id} className="flex-row items-center gap-3 py-1" accessible
            accessibilityLabel={`${t(`review.workspace.stage.${stage.id}`)}: ${t(`review.workspace.status.${stage.status}`)}`}>
            <View className={`h-6 w-6 items-center justify-center rounded-full ${stage.status === 'done' ? 'bg-accent' : stage.status === 'blocked' ? 'bg-error-muted' : 'bg-background-secondary'}`}>
              <Text variant="caption" weight="bold" color={stage.status === 'done' ? 'inverse' : stage.status === 'blocked' ? 'error' : 'secondary'}>
                {GLYPH[stage.status]}
              </Text>
            </View>
            <Text weight={stage.status === 'active' ? 'semibold' : 'regular'} color={stage.status === 'pending' ? 'tertiary' : 'primary'} className="flex-1">
              {t(`review.workspace.stage.${stage.id}`)}
            </Text>
            <Text variant="caption" color="tertiary">{t(`review.workspace.status.${stage.status}`)}</Text>
          </View>
        ))}
      </View>
      {journey.scan ? (
        <Text variant="body-sm" weight="semibold">
          {t('review.workspace.scanning', { number: number ?? '', done: journey.scan.done, total: journey.scan.total })}
        </Text>
      ) : null}
      {parts.total > 0 && !journey.complete && !journey.scan ? (
        <Text variant="body-sm" weight="semibold">{t('review.workspace.parts', { done: parts.done, total: parts.total })}</Text>
      ) : null}
      {!journey.complete && !problem ? (
        <Text variant="caption" color="secondary">
          {estimate ? t(estimate.unit === 'minutes' ? 'review.workspace.remainingMinutes' : 'review.workspace.remainingHours', { value: estimate.value })
            : parts.done < parts.total ? t('review.workspace.measuring') : null}
        </Text>
      ) : null}
      {journey.partial && journey.analysedUntilSec !== null ? (
        <View className="rounded-md bg-info-muted px-3 py-2">
          <Text variant="body-sm">{t('review.workspace.partial', { until: formatClock(journey.analysedUntilSec) })}</Text>
        </View>
      ) : null}
      {!journey.complete && !problem ? <Text variant="caption" color="tertiary">{t('review.workspace.leave')}</Text> : null}
      {problem ? (
        <View className="gap-2 rounded-md border border-border px-3 py-3" accessibilityRole="alert">
          <Text weight="semibold">{t(`review.problem.${problem.kind}.title`)}</Text>
          <Text variant="body-sm" color="secondary">{t(`review.problem.${problem.kind}.body`)}</Text>
          <Text variant="caption" color="tertiary">{t(problem.retryHelps ? 'review.problem.retryHelps' : 'review.problem.retryNoHelp')}</Text>
          {problem.action !== 'none' && onProblemAction ? (
            <Button size="sm" variant="secondary" loading={busy} onPress={() => onProblemAction(problem.action)} testID="workspace-problem-action">
              {t(`review.problem.${problem.kind}.action`)}
            </Button>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

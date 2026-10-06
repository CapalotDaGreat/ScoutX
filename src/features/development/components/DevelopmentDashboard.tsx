import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Badge, type BadgeVariant } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { EvidenceStateBadge } from '@/components/evidence/EvidenceStateBadge';
import { ProvenanceBadge } from '@/components/evidence/ProvenanceBadge';
import { GoalEditorModal } from '@/features/development/components/GoalEditorModal';
import { TrainingLogModal } from '@/features/development/components/TrainingLogModal';
import { type UseDevelopmentResult } from '@/features/development/hooks/useDevelopment';
import {
  type BeforeVsNowComparison,
  type CoverageState,
  type GoalProgressSummary,
  type GoalStatus,
  type HowIPlay,
  type IdentitySnapshot,
  type MatchDerivedMetricKey,
  type PlayerDnaTrait,
  type TrainingSession,
  type TrainingSessionType,
} from '@/features/development/types';
import { BEFORE_VS_NOW_MIN_SAMPLE } from '@/features/development/services/beforeVsNowService';
import { type GoalNextStep } from '@/features/intelligence/types';
import { useGoalStepCopy } from '@/features/today/components/TodayIntelligence';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

export type DevelopmentDashboardProps = {
  development: UseDevelopmentResult;
  embeddedInTabShell?: boolean;
  nestedUnderSegment?: boolean;
};

type Translate = ReturnType<typeof useAppTranslation>['t'];

function statusVariant(status: GoalStatus): BadgeVariant {
  switch (status) {
    case 'achieved':
      return 'success';
    case 'improving':
      return 'accent';
    case 'revisit':
      return 'warning';
    case 'not_started':
      return 'default';
    case 'active':
      return 'info';
  }
}

function statusLabel(t: Translate, status: GoalStatus): string {
  switch (status) {
    case 'achieved':
      return t('development:status.achieved');
    case 'improving':
      return t('development:status.improving');
    case 'revisit':
      return t('development:status.revisit');
    case 'not_started':
      return t('development:status.not_started');
    case 'active':
      return t('development:status.active');
  }
}

function metricShort(t: Translate, key: MatchDerivedMetricKey): string {
  switch (key) {
    case 'goals':
      return t('development:metric.goals');
    case 'assists':
      return t('development:metric.assists');
    case 'shots':
      return t('development:metric.shots');
    case 'tackles':
      return t('development:metric.tackles');
    case 'passAccuracy':
      return t('development:metric.passAccuracy');
    case 'matchRating':
      return t('development:metric.matchRating');
    case 'minutes':
      return t('development:metric.minutes');
  }
}

function formatMetricValue(key: MatchDerivedMetricKey, value: number): string {
  if (key === 'passAccuracy' || key === 'matchRating' || key === 'minutes') {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

function dnaLabel(t: Translate, id: PlayerDnaTrait['id']): string {
  switch (id) {
    case 'goal_threat':
      return t('development:dna.goal_threat');
    case 'creator':
      return t('development:dna.creator');
    case 'ball_retention':
      return t('development:dna.ball_retention');
    case 'defensive_presence':
      return t('development:dna.defensive_presence');
    case 'discipline':
      return t('development:dna.discipline');
    case 'availability':
      return t('development:dna.availability');
  }
}

function dnaUnit(t: Translate, unit: PlayerDnaTrait['unit']): string {
  switch (unit) {
    case 'per_match':
      return t('development:dna.perMatch');
    case 'percent':
      return t('development:dna.percent');
    case 'minutes':
      return t('development:dna.minutesUnit');
  }
}

function coverageToEvidenceState(state: CoverageState): 'available' | 'partial' | 'insufficient' {
  if (state === 'strong' || state === 'moderate') return 'available';
  if (state === 'limited') return 'partial';
  return 'insufficient';
}

function trainingTypeLabel(t: Translate, type: TrainingSessionType): string {
  switch (type) {
    case 'team':
      return t('development:training.types.team');
    case 'individual':
      return t('development:training.types.individual');
    case 'gym':
      return t('development:training.types.gym');
    case 'recovery':
      return t('development:training.types.recovery');
    case 'match_prep':
      return t('development:training.types.match_prep');
    case 'other':
      return t('development:training.types.other');
  }
}

function GoalCard({
  summary,
  nextStep,
  onMarkAchieved,
  saving,
}: {
  summary: GoalProgressSummary;
  nextStep: GoalNextStep | null;
  onMarkAchieved: (goalId: string) => void;
  saving: boolean;
}) {
  const { t } = useAppTranslation(['development', 'portfolio']);
  const goalStepCopy = useGoalStepCopy();
  const { goal, status, current, percent, daysLeft } = summary;
  return (
    <Card variant="default" padding="sm" className="gap-2">
      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1 gap-1">
          <Text weight="semibold" numberOfLines={2}>
            {goal.title}
          </Text>
          {goal.targetLabel ? (
            <Text variant="caption" color="secondary" numberOfLines={2}>
              {goal.targetLabel}
            </Text>
          ) : null}
        </View>
        <Badge label={statusLabel(t, status)} variant={statusVariant(status)} size="sm" />
      </View>
      {current ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <ProvenanceBadge provenance="match_derived" />
          <Text variant="caption" color="secondary">
            {t('development:goal.currentValue', {
              value: current.value.toFixed(2),
              count: current.sampleSize,
            })}
          </Text>
        </View>
      ) : goal.metricKey !== 'none' ? (
        <Text variant="caption" color="tertiary">
          {t('development:goal.noMeasurement')}
        </Text>
      ) : (
        <Text variant="caption" color="tertiary">
          {t('development:goal.notesOnly')}
        </Text>
      )}
      {percent !== null ? (
        <Text variant="caption" color="secondary">
          {t('development:goal.percentComplete', { percent })}
        </Text>
      ) : null}
      {daysLeft !== null ? (
        <Text variant="caption" color={daysLeft < 0 ? 'warning' : 'secondary'}>
          {daysLeft < 0
            ? t('development:goal.overdue', { days: Math.abs(daysLeft) })
            : t('development:goal.daysLeft', { days: daysLeft })}
        </Text>
      ) : null}
      {nextStep ? (
        <Text variant="caption" weight="medium">
          {t('portfolio:today.goalFocus.next', { step: goalStepCopy(nextStep) })}
        </Text>
      ) : null}
      {status !== 'achieved' ? (
        <Button size="sm" variant="secondary" disabled={saving} onPress={() => onMarkAchieved(goal.id)}>
          {t('development:goal.markAchieved')}
        </Button>
      ) : null}
    </Card>
  );
}

function TrainingRow({ session }: { session: TrainingSession }) {
  const { t, i18n } = useAppTranslation(['development']);
  const dateLabel = Number.isNaN(Date.parse(session.date))
    ? session.date
    : new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(new Date(session.date));
  return (
    <View className="flex-row items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <View className="min-w-0 flex-1">
        <Text weight="semibold" numberOfLines={1}>
          {session.focus}
        </Text>
        <Text variant="caption" color="secondary">
          {dateLabel}
          {' · '}
          {trainingTypeLabel(t, session.type)}
          {session.durationMin !== null
            ? ` · ${t('development:training.minutesShort', { count: session.durationMin })}`
            : ''}
        </Text>
      </View>
      <ProvenanceBadge provenance="self_reported" />
    </View>
  );
}

function BeforeVsNowRow({ comparison }: { comparison: BeforeVsNowComparison }) {
  const { t } = useAppTranslation(['development']);
  if (comparison.state === 'insufficient') {
    return (
      <View className="gap-1 rounded-xl border border-border bg-surface px-4 py-3">
        <View className="flex-row items-center justify-between gap-2">
          <Text weight="semibold">{metricShort(t, comparison.metricKey)}</Text>
          <EvidenceStateBadge state="insufficient" />
        </View>
        <Text variant="caption" color="secondary">
          {comparison.reason === 'not_enough_matches'
            ? t('development:beforeVsNow.needMatches', {
                have: comparison.sampleSize,
                need: comparison.required,
              })
            : t('development:beforeVsNow.needRecorded', {
                have: comparison.sampleSize,
                need: comparison.required,
              })}
        </Text>
      </View>
    );
  }
  const deltaLabel =
    comparison.direction === 'flat'
      ? t('development:beforeVsNow.unchanged')
      : comparison.improved === true
        ? t('development:beforeVsNow.improved', { delta: Math.abs(comparison.delta).toFixed(2) })
        : t('development:beforeVsNow.declined', { delta: Math.abs(comparison.delta).toFixed(2) });
  return (
    <View className="gap-1 rounded-xl border border-border bg-surface px-4 py-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text weight="semibold">{metricShort(t, comparison.metricKey)}</Text>
        <ProvenanceBadge provenance={comparison.provenance} />
      </View>
      <Text variant="caption" color="secondary">
        {t('development:beforeVsNow.values', {
          before: formatMetricValue(comparison.metricKey, comparison.before.value),
          now: formatMetricValue(comparison.metricKey, comparison.now.value),
          sample: comparison.now.sampleSize,
        })}
      </Text>
      <Text
        variant="caption"
        color={comparison.improved === true ? 'success' : comparison.improved === false ? 'warning' : 'secondary'}
      >
        {deltaLabel}
      </Text>
    </View>
  );
}

function DnaRow({ trait }: { trait: PlayerDnaTrait }) {
  const { t } = useAppTranslation(['development']);
  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <View className="min-w-0 flex-1">
        <Text weight="semibold">{dnaLabel(t, trait.id)}</Text>
        {trait.value === null ? (
          <Text variant="caption" color="tertiary">
            {t('development:dna.notRecorded')}
          </Text>
        ) : (
          <Text variant="caption" color="secondary">
            {t('development:dna.value', {
              value: trait.value.toFixed(2),
              unit: dnaUnit(t, trait.unit),
              count: trait.sampleSize,
            })}
          </Text>
        )}
      </View>
      <EvidenceStateBadge state={coverageToEvidenceState(trait.state)} />
    </View>
  );
}

function HowIPlayCard({ howIPlay }: { howIPlay: HowIPlay }) {
  const { t } = useAppTranslation(['development']);
  const { selfReported, matchDerived, sampleSize } = howIPlay;
  const positions = selfReported.positions.join(' · ');
  return (
    <View className="gap-3">
      <Card variant="default" padding="sm" className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text weight="semibold">{t('development:howIPlay.selfReportedTitle')}</Text>
          <ProvenanceBadge provenance="self_reported" />
        </View>
        {positions ? (
          <Text color="secondary">{positions}</Text>
        ) : (
          <Text color="tertiary">{t('development:howIPlay.noPosition')}</Text>
        )}
        {selfReported.style ? (
          <Text color="secondary">{selfReported.style}</Text>
        ) : (
          <Text color="tertiary">{t('development:howIPlay.noStyle')}</Text>
        )}
      </Card>
      <Text variant="caption" color="tertiary">
        {t('development:howIPlay.matchDerivedHint', { count: sampleSize })}
      </Text>
      {matchDerived.map((trait) => (
        <DnaRow key={trait.id} trait={trait} />
      ))}
    </View>
  );
}

function IdentityTimeline({ snapshots }: { snapshots: IdentitySnapshot[] }) {
  const { t, i18n } = useAppTranslation(['development']);
  if (snapshots.length === 0) {
    return (
      <Text variant="caption" color="secondary">
        {t('development:identity.empty')}
      </Text>
    );
  }
  return (
    <View className="gap-2">
      {snapshots.slice(0, 8).map((snapshot) => {
        const dateLabel = Number.isNaN(Date.parse(snapshot.effectiveFrom))
          ? snapshot.effectiveFrom
          : new Intl.DateTimeFormat(i18n.language, { month: 'short', year: 'numeric' }).format(
              new Date(snapshot.effectiveFrom),
            );
        const parts = [snapshot.position, snapshot.club, snapshot.style].filter(
          (part): part is string => Boolean(part),
        );
        return (
          <View key={snapshot.id} className="flex-row items-start gap-3">
            <Text variant="caption" color="tertiary" className="w-20 pt-0.5">
              {dateLabel}
            </Text>
            <View className="min-w-0 flex-1 gap-1">
              <Text numberOfLines={2}>
                {parts.length > 0 ? parts.join(' · ') : t('development:identity.unspecified')}
              </Text>
              <ProvenanceBadge provenance={snapshot.source} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function DevelopmentDashboard({
  development,
  embeddedInTabShell = false,
  nestedUnderSegment = false,
}: DevelopmentDashboardProps) {
  const { t } = useAppTranslation(['development', 'common', 'errors']);
  const [goalEditorOpen, setGoalEditorOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [matchPrep, setMatchPrep] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    goals,
    nextSteps,
    trainingSessions,
    identitySnapshots,
    beforeVsNow,
    howIPlay,
    isLoading,
    loadError,
    isSaving,
    refetch,
    createGoal,
    setGoalStatus,
    logTraining,
    repeatLastTraining,
  } = development;

  const handleError = useCallback((caught: unknown) => {
    setActionError(toUserMessage(caught, t('errors:generic')));
  }, [t]);

  const screenProps = {
    ...(embeddedInTabShell ? { embeddedInTabShell: true as const } : {}),
    ...(nestedUnderSegment ? { safeAreaEdges: ['left', 'right'] as Array<'left' | 'right'> } : {}),
  };

  const availableCount = useMemo(
    () => beforeVsNow.filter((item) => item.state === 'available').length,
    [beforeVsNow],
  );

  if (isLoading) {
    return (
      <Screen title={t('development:title')} subtitle={t('development:subtitle')} safeArea {...screenProps}>
        <SkeletonLoader variant="card" count={3} />
      </Screen>
    );
  }

  return (
    <Screen
      title={t('development:title')}
      subtitle={t('development:subtitle')}
      safeArea
      contentClassName="gap-6"
      error={loadError ? toUserMessage(loadError, t('errors:generic')) : actionError}
      onRetry={loadError ? refetch : undefined}
      {...screenProps}
    >
      <View className="flex-row flex-wrap gap-2">
        <Button size="sm" onPress={() => setGoalEditorOpen(true)}>
          {t('development:goal.add')}
        </Button>
        <Button size="sm" variant="secondary" onPress={() => setTrainingOpen(true)}>
          {t('development:training.add')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={isSaving || trainingSessions.length === 0}
          onPress={() => {
            void repeatLastTraining().catch(handleError);
          }}
        >
          {t('development:training.repeatLast')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onPress={() => {
            setMatchPrep(true);
            setTrainingOpen(true);
          }}
        >
          {t('development:training.matchdayPrep')}
        </Button>
      </View>

      <CollapsibleSection title={t('development:sections.goals')} defaultOpen persistKey="dev-goals">
        {goals.length === 0 ? (
          <EmptyState
            title={t('development:goal.emptyTitle')}
            description={t('development:goal.emptyDescription')}
            actionLabel={t('development:goal.add')}
            onAction={() => setGoalEditorOpen(true)}
          />
        ) : (
          <View className="gap-3">
            {goals.map((summary) => (
              <GoalCard
                key={summary.goal.id}
                summary={summary}
                nextStep={nextSteps[summary.goal.id] ?? null}
                saving={isSaving}
                onMarkAchieved={(goalId) => {
                  void setGoalStatus(goalId, 'achieved').catch(handleError);
                }}
              />
            ))}
          </View>
        )}
      </CollapsibleSection>

      <CollapsibleSection title={t('development:sections.training')} defaultOpen persistKey="dev-training">
        {trainingSessions.length === 0 ? (
          <EmptyState
            title={t('development:training.emptyTitle')}
            description={t('development:training.emptyDescription')}
            actionLabel={t('development:training.add')}
            onAction={() => setTrainingOpen(true)}
          />
        ) : (
          <View className="gap-2">
            {trainingSessions.slice(0, 8).map((session) => (
              <TrainingRow key={session.id} session={session} />
            ))}
          </View>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={t('development:sections.beforeVsNow')}
        subtitle={t('development:beforeVsNow.subtitle', { count: BEFORE_VS_NOW_MIN_SAMPLE * 2 })}
        defaultOpen={availableCount > 0}
        persistKey="dev-bvn"
      >
        <View className="gap-2">
          {beforeVsNow.map((comparison) => (
            <BeforeVsNowRow key={comparison.metricKey} comparison={comparison} />
          ))}
        </View>
      </CollapsibleSection>

      <CollapsibleSection title={t('development:sections.howIPlay')} defaultOpen persistKey="dev-how">
        {howIPlay ? <HowIPlayCard howIPlay={howIPlay} /> : null}
      </CollapsibleSection>

      <CollapsibleSection title={t('development:sections.identity')} persistKey="dev-identity">
        <IdentityTimeline snapshots={identitySnapshots} />
      </CollapsibleSection>

      <GoalEditorModal
        visible={goalEditorOpen}
        saving={isSaving}
        onClose={() => setGoalEditorOpen(false)}
        onSave={createGoal}
      />
      <TrainingLogModal
        visible={trainingOpen}
        saving={isSaving}
        goals={goals}
        presetType={matchPrep ? 'match_prep' : undefined}
        onClose={() => {
          setTrainingOpen(false);
          setMatchPrep(false);
        }}
        onSave={logTraining}
      />
    </Screen>
  );
}

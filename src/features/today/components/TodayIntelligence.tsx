import { Pressable, View } from 'react-native';
import { ChevronRight, History, Target, TrendingUp } from 'lucide-react-native';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { type CoverageState, type MatchDerivedMetricKey } from '@/features/development/types';
import {
  type ChangeItem,
  type CoverageDimension,
  type GoalNextStep,
  type NextBestEvidence,
} from '@/features/intelligence/types';
import { type TodayGoalFocus } from '@/features/today/hooks/useTodayPlan';
import { type TodayActionHandler } from '@/features/today/components/TodaySection';
import { type TodayRoute } from '@/features/today/types';
import { type TrialStatus } from '@/features/trial-invitations/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

type Translate = ReturnType<typeof useAppTranslation>['t'];

const COVERAGE_DIMENSIONS: readonly CoverageDimension[] = [
  'technical',
  'tactical',
  'physical',
  'consistency',
  'video',
];
const COVERAGE_STATES: readonly CoverageState[] = ['insufficient', 'limited', 'moderate', 'strong'];
const TRIAL_STATUSES: readonly TrialStatus[] = [
  'pending',
  'accepted',
  'declined',
  'rescheduled',
  'cancelled',
  'completed',
];
const GOAL_METRICS: readonly (MatchDerivedMetricKey | 'none')[] = [
  'none',
  'goals',
  'assists',
  'shots',
  'tackles',
  'passAccuracy',
  'matchRating',
  'minutes',
];

function oneOf<T extends string>(values: readonly T[], value: string | number | undefined): T | null {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? (value as T) : null;
}

function count(value: string | number | undefined): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function text(value: string | number | undefined): string {
  return value === undefined ? '' : String(value);
}

function dimensionLabel(t: Translate, value: string | number | undefined): string {
  const dimension = oneOf(COVERAGE_DIMENSIONS, value);
  return dimension ? t(`passport:coverage.${dimension}`) : text(value);
}

function stateLabel(t: Translate, value: string | number | undefined): string {
  const state = oneOf(COVERAGE_STATES, value);
  return state ? t(`portfolio:today.coverageState.${state}`) : text(value);
}

function metricLabel(t: Translate, value: string | number | undefined): string {
  const metric = oneOf(GOAL_METRICS, value);
  return metric ? t(`development:metric.${metric}`) : text(value);
}

function changeCopy(t: Translate, change: ChangeItem): string {
  const { params } = change;
  switch (change.kind) {
    case 'new_matches':
      return t('portfolio:today.changes.new_matches', { count: count(params.count) });
    case 'new_analysis':
      return t('portfolio:today.changes.new_analysis');
    case 'goal_achieved':
      return t('portfolio:today.changes.goal_achieved');
    case 'goal_improving':
      return t('portfolio:today.changes.goal_improving');
    case 'new_video':
      return t('portfolio:today.changes.new_video', { count: count(params.count) });
    case 'new_trial':
      return t('portfolio:today.changes.new_trial');
    case 'trial_status': {
      const status = oneOf(TRIAL_STATUSES, params.to);
      return t('portfolio:today.changes.trial_status', {
        status: status ? t(`portfolio:today.trialStatus.${status}`) : text(params.to),
      });
    }
    case 'role_change':
      return t('portfolio:today.changes.role_change', { from: text(params.from), to: text(params.to) });
    case 'verification_change':
      return change.significance >= 4
        ? t('portfolio:today.changes.verification_up')
        : t('portfolio:today.changes.verification_down');
    case 'coverage_up':
      return t('portfolio:today.changes.coverage_up', {
        dimension: dimensionLabel(t, params.dimension),
        state: stateLabel(t, params.to),
      });
    case 'coverage_down':
      return t('portfolio:today.changes.coverage_down', {
        dimension: dimensionLabel(t, params.dimension),
        state: stateLabel(t, params.to),
      });
    case 'new_endorsement':
      return t('portfolio:today.changes.new_endorsement', { count: count(params.count) });
  }
}

function changeRoute(change: ChangeItem): TodayRoute | null {
  switch (change.kind) {
    case 'new_analysis':
      return 'matchAnalysis';
    case 'goal_achieved':
    case 'goal_improving':
    case 'new_matches':
      return 'development';
    case 'new_video':
      return 'manageVideos';
    case 'new_trial':
    case 'trial_status':
      return 'trials';
    default:
      return null;
  }
}

export function SinceLastVisitCard({
  changes,
  onAction,
  onDismiss,
}: {
  changes: ChangeItem[];
  onAction: TodayActionHandler;
  onDismiss: () => void;
}) {
  const { t } = useAppTranslation(['portfolio', 'passport']);
  const { colors } = useTheme();
  return (
    <Card variant="default" padding="md" className="gap-3">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2">
          <History size={16} color={colors.textSecondary} />
          <Text variant="label" weight="semibold" accessibilityRole="header">
            {t('portfolio:today.changes.title')}
          </Text>
        </View>
        <Button size="sm" variant="ghost" onPress={onDismiss}>
          {t('portfolio:today.changes.dismiss')}
        </Button>
      </View>
      {changes.map((change) => {
        const label = changeCopy(t, change);
        const route = changeRoute(change);
        if (!route) {
          return (
            <Text key={change.id} color="secondary">
              {label}
            </Text>
          );
        }
        return (
          <Pressable
            key={change.id}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() =>
              onAction(route, route === 'matchAnalysis' || route === 'trials' ? change.entityId : undefined)
            }
            className="min-h-11 flex-row items-center gap-2 active:opacity-80"
          >
            <Text className="min-w-0 flex-1">{label}</Text>
            <ChevronRight size={16} color={colors.textSecondary} />
          </Pressable>
        );
      })}
    </Card>
  );
}

function goalStepCopy(t: Translate, step: GoalNextStep): string {
  const { params } = step;
  switch (step.kind) {
    case 'prove_achievement':
      return t('portfolio:today.goalStep.prove_achievement');
    case 'revisit_goal':
      return t('portfolio:today.goalStep.revisit_goal');
    case 'baseline_missing':
      return t('portfolio:today.goalStep.baseline_missing', { metric: metricLabel(t, params.metric) });
    case 'record_metric':
      return t('portfolio:today.goalStep.record_metric', {
        metric: metricLabel(t, params.metric),
        count: count(params.matches),
      });
    case 'log_match_to_measure':
      return t('portfolio:today.goalStep.log_match_to_measure', { metric: metricLabel(t, params.metric) });
    case 'play_more_matches':
      return t('portfolio:today.goalStep.play_more_matches', {
        have: count(params.have),
        need: count(params.need),
      });
    case 'log_training':
      return count(params.days) < 0
        ? t('portfolio:today.goalStep.log_training_first')
        : t('portfolio:today.goalStep.log_training', { days: count(params.days) });
    case 'shift_focus':
      return t('portfolio:today.goalStep.shift_focus', { count: count(params.matches) });
    case 'ask_coach':
      return t('portfolio:today.goalStep.ask_coach', { count: count(params.matches) });
    case 'keep_going':
      return t('portfolio:today.goalStep.keep_going');
    case 'reflect':
      return t('portfolio:today.goalStep.reflect');
  }
}

export function goalStepRoute(step: GoalNextStep): TodayRoute {
  switch (step.kind) {
    case 'record_metric':
    case 'log_match_to_measure':
    case 'play_more_matches':
      return 'logMatch';
    case 'prove_achievement':
      return 'manageVideos';
    default:
      return 'development';
  }
}

export function useGoalStepCopy(): (step: GoalNextStep) => string {
  const { t } = useAppTranslation(['portfolio', 'development']);
  return (step) => goalStepCopy(t, step);
}

export function GoalFocusCard({ focus, onAction }: { focus: TodayGoalFocus; onAction: TodayActionHandler }) {
  const { t } = useAppTranslation(['portfolio', 'development']);
  const { colors } = useTheme();
  const { summary, nextStep } = focus;
  const step = goalStepCopy(t, nextStep);
  return (
    <Card
      variant="default"
      padding="sm"
      interactive
      onPress={() => onAction(goalStepRoute(nextStep))}
      accessibilityRole="button"
      accessibilityLabel={`${t('portfolio:today.goalFocus.title')}: ${summary.goal.title}. ${step}`}
      className="gap-2"
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2">
          <Target size={16} color={colors.textSecondary} />
          <Text variant="label" color="secondary">
            {t('portfolio:today.goalFocus.title')}
          </Text>
        </View>
        <Badge label={t(`development:status.${summary.status}`)} variant="default" size="sm" />
      </View>
      <Text weight="semibold" numberOfLines={2}>
        {summary.goal.title}
      </Text>
      {summary.percent !== null ? (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.max(0, Math.min(100, summary.percent)) }}
          accessibilityLabel={summary.goal.title}
          className="h-1 overflow-hidden rounded-sm bg-background-secondary"
        >
          <View style={{ width: `${Math.max(0, Math.min(100, summary.percent))}%`, height: 4, backgroundColor: colors.accent }} />
        </View>
      ) : null}
      <Text variant="caption" color="secondary">
        {t('portfolio:today.goalFocus.next', { step })}
      </Text>
    </Card>
  );
}

function evidenceCopy(t: Translate, evidence: NextBestEvidence): { title: string; reason: string } {
  const { params } = evidence;
  switch (evidence.kind) {
    case 'first_match':
      return {
        title: t('portfolio:today.evidence.first_match.title'),
        reason: t('portfolio:today.evidence.first_match.reason'),
      };
    case 'recent_match':
      return {
        title: t('portfolio:today.evidence.recent_match.title'),
        reason: t('portfolio:today.evidence.recent_match.reason', { days: count(params.days) }),
      };
    case 'match_video':
      return {
        title: t('portfolio:today.evidence.match_video.title'),
        reason: t('portfolio:today.evidence.match_video.reason'),
      };
    case 'match_analysis':
      return {
        title: t('portfolio:today.evidence.match_analysis.title'),
        reason: t('portfolio:today.evidence.match_analysis.reason'),
      };
    case 'record_passing':
      return {
        title: t('portfolio:today.evidence.record_passing.title'),
        reason: t('portfolio:today.evidence.record_passing.reason', {
          have: count(params.have),
          need: count(params.need),
        }),
      };
    case 'record_defending':
      return {
        title: t('portfolio:today.evidence.record_defending.title'),
        reason: t('portfolio:today.evidence.record_defending.reason', {
          have: count(params.have),
          need: count(params.need),
        }),
      };
    case 'coach_reference':
      return {
        title: t('portfolio:today.evidence.coach_reference.title'),
        reason: t('portfolio:today.evidence.coach_reference.reason'),
      };
    case 'gps_session':
      return {
        title: t('portfolio:today.evidence.gps_session.title'),
        reason: t('portfolio:today.evidence.gps_session.reason'),
      };
  }
}

function evidenceAction(evidence: NextBestEvidence): { route: TodayRoute; entityId?: string } | null {
  switch (evidence.kind) {
    case 'first_match':
    case 'recent_match':
    case 'record_passing':
    case 'record_defending':
      return { route: 'logMatch' };
    case 'match_video':
      return { route: 'manageVideos' };
    case 'match_analysis':
      return { route: 'matchAnalysis' };
    case 'coach_reference':
      return { route: 'passportSetup', entityId: 'invite_coach' };
    case 'gps_session':
      return null;
  }
}

export function NextEvidenceCard({
  evidence,
  onAction,
}: {
  evidence: NextBestEvidence;
  onAction: TodayActionHandler;
}) {
  const { t } = useAppTranslation(['portfolio', 'passport']);
  const { colors } = useTheme();
  const copy = evidenceCopy(t, evidence);
  const action = evidenceAction(evidence);
  return (
    <Card variant="default" padding="sm" className="gap-2">
      <View className="flex-row items-center gap-2">
        <TrendingUp size={16} color={colors.textSecondary} />
        <Text variant="label" color="secondary">
          {t('portfolio:today.evidence.title')}
        </Text>
      </View>
      <Text weight="semibold">{copy.title}</Text>
      <Text variant="caption" color="secondary">
        {copy.reason}
      </Text>
      {evidence.strongestDimension ? (
        <Text variant="caption" color="tertiary">
          {t('portfolio:today.evidence.strongest', {
            dimension: dimensionLabel(t, evidence.strongestDimension),
          })}
        </Text>
      ) : null}
      {action ? (
        <Button
          size="sm"
          variant="secondary"
          accessibilityHint={copy.reason}
          onPress={() => onAction(action.route, action.entityId)}
        >
          {copy.title}
        </Button>
      ) : null}
    </Card>
  );
}

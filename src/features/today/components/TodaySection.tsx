import { Pressable, View } from 'react-native';
import { ChevronRight, CalendarClock, Sparkles } from 'lucide-react-native';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { type OnboardingStepId } from '@/features/player-onboarding/types';
import {
  type ContinueItem,
  type NextBestAction,
  type TodayAnalysisJob,
  type TodayPlan,
  type TodayRoute,
  type TodayTrial,
} from '@/features/today/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

export type TodayActionHandler = (route: TodayRoute, entityId?: string) => void;

export type TodaySectionProps = {
  plan: TodayPlan;
  latestAnalysis: TodayAnalysisJob | null;
  upcomingTrial: TodayTrial | null;
  analysesUnavailable: boolean;
  isLoading: boolean;
  onAction: TodayActionHandler;
};

type Translate = ReturnType<typeof useAppTranslation>['t'];

type ActionCopy = { title: string; description: string; reason: string };

function str(value: string | number | undefined): string {
  return value === undefined ? '' : String(value);
}

function num(value: string | number | undefined): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function passportStepLabel(t: Translate, stepId: string | undefined, fallback: string): string {
  switch (stepId as OnboardingStepId | undefined) {
    case 'log_first_match':
      return t('portfolio:today.passportSteps.log_first_match');
    case 'claim_username':
      return t('portfolio:today.passportSteps.claim_username');
    case 'enable_passport':
      return t('portfolio:today.passportSteps.enable_passport');
    case 'invite_coach':
      return t('portfolio:today.passportSteps.invite_coach');
    case 'enable_discoverable':
      return t('portfolio:today.passportSteps.enable_discoverable');
    default:
      return fallback;
  }
}

function actionCopy(t: Translate, action: NextBestAction): ActionCopy {
  const { params } = action;
  switch (action.type) {
    case 'log_first_match':
      return {
        title: t('portfolio:today.actions.log_first_match.title'),
        description: t('portfolio:today.actions.log_first_match.description'),
        reason: t('portfolio:today.actions.log_first_match.reason'),
      };
    case 'log_match':
      return {
        title: t('portfolio:today.actions.log_match.title'),
        description: t('portfolio:today.actions.log_match.description'),
        reason: t('portfolio:today.actions.log_match.reason', { days: num(params.days) }),
      };
    case 'retry_analysis':
      return {
        title: t('portfolio:today.actions.retry_analysis.title'),
        description: t('portfolio:today.actions.retry_analysis.description'),
        reason: t('portfolio:today.actions.retry_analysis.reason', { opponent: str(params.opponent) }),
      };
    case 'review_coaching':
      return {
        title: t('portfolio:today.actions.review_coaching.title'),
        description: t('portfolio:today.actions.review_coaching.description', {
          opponent: str(params.opponent),
        }),
        reason: t('portfolio:today.actions.review_coaching.reason', { opponent: str(params.opponent) }),
      };
    case 'analyze_match':
      return {
        title: t('portfolio:today.actions.analyze_match.title', { opponent: str(params.opponent) }),
        description: t('portfolio:today.actions.analyze_match.description'),
        reason: t('portfolio:today.actions.analyze_match.reason'),
      };
    case 'respond_trial':
      return {
        title: t('portfolio:today.actions.respond_trial.title'),
        description: t('portfolio:today.actions.respond_trial.description', { club: str(params.club) }),
        reason: t('portfolio:today.actions.respond_trial.reason'),
      };
    case 'prepare_trial': {
      const days = num(params.days);
      const reason =
        days <= 0
          ? t('portfolio:today.actions.prepare_trial.reasonToday')
          : days === 1
            ? t('portfolio:today.actions.prepare_trial.reasonTomorrow')
            : t('portfolio:today.actions.prepare_trial.reasonDays', { days });
      return {
        title: t('portfolio:today.actions.prepare_trial.title', { club: str(params.club) }),
        description: t('portfolio:today.actions.prepare_trial.description'),
        reason,
      };
    }
    case 'improve_passport':
      return {
        title: t('portfolio:today.actions.improve_passport.title'),
        description: t('portfolio:today.actions.improve_passport.description', {
          step: passportStepLabel(t, action.entityId, str(params.step)),
        }),
        reason: t('portfolio:today.actions.improve_passport.reason', {
          done: num(params.done),
          total: num(params.total),
        }),
      };
    case 'build_reel':
      return {
        title: t('portfolio:today.actions.build_reel.title'),
        description: t('portfolio:today.actions.build_reel.description'),
        reason: t('portfolio:today.actions.build_reel.reason'),
      };
  }
}

function useFormatters() {
  const { i18n } = useAppTranslation();
  const locale = i18n.language;
  return {
    time(iso: string): string {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) {
        return '';
      }
      const sameDay = date.toDateString() === new Date().toDateString();
      return new Intl.DateTimeFormat(
        locale,
        sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
      ).format(date);
    },
    date(iso: string): string {
      const date = new Date(iso);
      return Number.isNaN(date.getTime())
        ? iso
        : new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
    },
  };
}

function continueCopy(
  t: Translate,
  item: ContinueItem,
  formatTime: (iso: string) => string,
): { title: string; description: string } {
  const { params } = item;
  switch (item.kind) {
    case 'match_draft': {
      const time = formatTime(str(params.savedAt));
      const opponent = str(params.opponent);
      return {
        title: t('portfolio:today.continue.match_draft.title'),
        description: opponent
          ? t('portfolio:today.continue.match_draft.description', { opponent, time })
          : t('portfolio:today.continue.match_draft.descriptionNoOpponent', { time }),
      };
    }
    case 'failed_analysis':
      return {
        title: t('portfolio:today.continue.failed_analysis.title'),
        description: t('portfolio:today.continue.failed_analysis.description', { opponent: str(params.opponent) }),
      };
    case 'analysis_in_progress':
      return {
        title: t('portfolio:today.continue.analysis_in_progress.title'),
        description: t('portfolio:today.continue.analysis_in_progress.description', {
          opponent: str(params.opponent),
        }),
      };
    case 'failed_upload':
      return {
        title: t('portfolio:today.continue.failed_upload.title'),
        description: t('portfolio:today.continue.failed_upload.description', { title: str(params.title) }),
      };
    case 'incomplete_passport':
      return {
        title: t('portfolio:today.continue.incomplete_passport.title'),
        description: t('portfolio:today.continue.incomplete_passport.description', {
          done: num(params.done),
          total: num(params.total),
        }),
      };
  }
}

function analysisStatusBadge(
  t: Translate,
  job: TodayAnalysisJob,
): { label: string; variant: 'success' | 'error' | 'info' | 'warning' } {
  switch (job.status) {
    case 'complete':
      return { label: t('portfolio:today.latestAnalysis.complete'), variant: 'success' };
    case 'failed':
      return { label: t('portfolio:today.latestAnalysis.failed'), variant: 'error' };
    case 'queued':
    case 'processing':
      return { label: t('portfolio:today.latestAnalysis.processing'), variant: 'info' };
    case 'draft':
    case 'uploading':
      return { label: t('portfolio:today.latestAnalysis.uploading'), variant: 'warning' };
  }
}

function PrimaryActionCard({ action, onAction }: { action: NextBestAction; onAction: TodayActionHandler }) {
  const { t } = useAppTranslation(['portfolio', 'common']);
  const { colors } = useTheme();
  const copy = actionCopy(t, action);
  return (
    <Card variant="prestige" padding="md" className="gap-3">
      <View className="flex-row items-center gap-2">
        <Sparkles size={16} color={colors.accent} />
        <Text variant="overline" color="secondary">
          {t('portfolio:today.nextBestAction')}
        </Text>
      </View>
      <View className="gap-1">
        <Heading level={3}>{copy.title}</Heading>
        <Text color="secondary">{copy.description}</Text>
      </View>
      <Text variant="caption" color="tertiary">
        {t('portfolio:today.why', { reason: copy.reason })}
      </Text>
      <Button
        variant="accent"
        onPress={() => onAction(action.route, action.entityId)}
        accessibilityHint={copy.reason}
      >
        {copy.title}
      </Button>
    </Card>
  );
}

function SecondaryActionRow({ action, onAction }: { action: NextBestAction; onAction: TodayActionHandler }) {
  const { t } = useAppTranslation(['portfolio']);
  const { colors } = useTheme();
  const copy = actionCopy(t, action);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.title}
      accessibilityHint={copy.reason}
      onPress={() => onAction(action.route, action.entityId)}
      className="min-h-14 flex-row items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 active:opacity-80"
    >
      <View className="min-w-0 flex-1">
        <Text weight="semibold" numberOfLines={2}>
          {copy.title}
        </Text>
        <Text variant="caption" color="secondary" numberOfLines={2}>
          {t('portfolio:today.why', { reason: copy.reason })}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

function ContinueList({ items, onAction }: { items: ContinueItem[]; onAction: TodayActionHandler }) {
  const { t } = useAppTranslation(['portfolio']);
  const formatters = useFormatters();
  return (
    <View className="gap-2">
      <Text variant="label" weight="semibold" className="px-1">
        {t('portfolio:today.continueTitle')}
      </Text>
      {items.map((item) => {
        const copy = continueCopy(t, item, formatters.time);
        return (
          <View
            key={item.id}
            className="flex-row items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
          >
            <View className="min-w-0 flex-1">
              <Text weight="semibold" numberOfLines={1}>
                {copy.title}
              </Text>
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {copy.description}
              </Text>
            </View>
            <Button
              size="sm"
              variant="secondary"
              accessibilityLabel={`${t('portfolio:today.continueAction')}: ${copy.title}`}
              onPress={() => onAction(item.route, item.entityId)}
            >
              {t('portfolio:today.continueAction')}
            </Button>
          </View>
        );
      })}
    </View>
  );
}

function LatestAnalysisCard({
  job,
  unavailable,
  onAction,
}: {
  job: TodayAnalysisJob | null;
  unavailable: boolean;
  onAction: TodayActionHandler;
}) {
  const { t } = useAppTranslation(['portfolio']);
  const formatters = useFormatters();

  if (unavailable) {
    return (
      <Card variant="default" padding="sm" className="gap-1">
        <Text variant="label" weight="semibold">
          {t('portfolio:today.latestAnalysis.title')}
        </Text>
        <Text variant="caption" color="secondary">
          {t('portfolio:today.latestAnalysis.loadError')}
        </Text>
      </Card>
    );
  }

  if (!job) {
    return (
      <Card variant="default" padding="sm" className="gap-2">
        <Text variant="label" weight="semibold">
          {t('portfolio:today.latestAnalysis.emptyTitle')}
        </Text>
        <Text variant="caption" color="secondary">
          {t('portfolio:today.latestAnalysis.emptyDescription')}
        </Text>
        <Button size="sm" variant="secondary" onPress={() => onAction('matchAnalysis')}>
          {t('portfolio:today.latestAnalysis.emptyAction')}
        </Button>
      </Card>
    );
  }

  const badge = analysisStatusBadge(t, job);
  return (
    <Card
      variant="default"
      padding="sm"
      interactive
      onPress={() => onAction('matchAnalysis', job.id)}
      accessibilityRole="button"
      accessibilityLabel={`${t('portfolio:today.latestAnalysis.title')}: ${job.opponent}, ${badge.label}`}
      className="gap-2"
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="label" color="secondary">
          {t('portfolio:today.latestAnalysis.title')}
        </Text>
        <Badge label={badge.label} variant={badge.variant} size="sm" />
      </View>
      <Text weight="semibold" numberOfLines={1}>
        {job.opponent}
      </Text>
      <Text variant="caption" color="secondary">
        {formatters.date(job.matchDate)}
      </Text>
    </Card>
  );
}

function UpcomingTrialCard({ trial, onAction }: { trial: TodayTrial; onAction: TodayActionHandler }) {
  const { t } = useAppTranslation(['portfolio']);
  const { colors } = useTheme();
  const formatters = useFormatters();
  const statusLabel =
    trial.status === 'pending'
      ? t('portfolio:today.upcomingTrial.pending')
      : t('portfolio:today.upcomingTrial.accepted');
  return (
    <Card
      variant="default"
      padding="sm"
      interactive
      onPress={() => onAction('trials', trial.id)}
      accessibilityRole="button"
      accessibilityLabel={`${t('portfolio:today.upcomingTrial.title')}: ${trial.club}, ${statusLabel}`}
      className="gap-2"
    >
      <View className="flex-row items-center gap-2">
        <CalendarClock size={16} color={colors.textSecondary} />
        <Text variant="label" color="secondary">
          {t('portfolio:today.upcomingTrial.title')}
        </Text>
      </View>
      <Text weight="semibold" numberOfLines={1}>
        {trial.club}
      </Text>
      <Text variant="caption" color="secondary">
        {formatters.date(trial.scheduledDate)} · {statusLabel}
      </Text>
    </Card>
  );
}

/**
 * Top of the player Home: the single most useful next step with its reason, up to two
 * alternatives, unfinished workflows, and compact snapshots. Nothing here is invented —
 * when there is nothing to do the section says so.
 */
export function TodaySection({
  plan,
  latestAnalysis,
  upcomingTrial,
  analysesUnavailable,
  isLoading,
  onAction,
}: TodaySectionProps) {
  const { t } = useAppTranslation(['portfolio']);

  if (isLoading) {
    return (
      <View className="gap-3" accessibilityLabel={t('portfolio:today.title')}>
        <SkeletonLoader variant="card" />
      </View>
    );
  }

  return (
    <View className="gap-4">
      {plan.primary ? (
        <PrimaryActionCard action={plan.primary} onAction={onAction} />
      ) : (
        <Card variant="default" padding="md" className="gap-1">
          <Heading level={3}>{t('portfolio:today.upToDateTitle')}</Heading>
          <Text color="secondary">{t('portfolio:today.upToDateDescription')}</Text>
        </Card>
      )}

      {analysesUnavailable ? (
        <Text variant="caption" color="warning" className="px-1">
          {t('portfolio:today.analysesUnavailable')}
        </Text>
      ) : null}

      {plan.secondary.length > 0 ? (
        <View className="gap-2">
          <Text variant="label" weight="semibold" className="px-1">
            {t('portfolio:today.alsoWorthDoing')}
          </Text>
          {plan.secondary.map((action) => (
            <SecondaryActionRow key={action.id} action={action} onAction={onAction} />
          ))}
        </View>
      ) : null}

      {plan.continueItems.length > 0 ? (
        <ContinueList items={plan.continueItems} onAction={onAction} />
      ) : null}

      <View className="flex-row flex-wrap gap-3">
        <View className="min-w-[46%] flex-1">
          <LatestAnalysisCard job={latestAnalysis} unavailable={analysesUnavailable} onAction={onAction} />
        </View>
        {upcomingTrial ? (
          <View className="min-w-[46%] flex-1">
            <UpcomingTrialCard trial={upcomingTrial} onAction={onAction} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

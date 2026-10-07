import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import type {
  CareerFirst,
  SeasonComparison,
  YearInReview,
} from '@/features/career-story/services/careerSeasons';
import { MIN_COMPARISON_MATCHES } from '@/features/career-story/services/careerSeasons';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

function useDateFormat() {
  const { i18n } = useAppTranslation(['career']);
  return (iso: string): string =>
    Number.isNaN(Date.parse(iso))
      ? '—'
      : new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View className="min-w-[22%] flex-1 rounded-xl bg-surface-elevated px-3 py-2" accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="caption" color="secondary">
        {label}
      </Text>
      <Text weight="semibold" className="text-lg">
        {value}
      </Text>
    </View>
  );
}

export function YearInReviewCard({ review }: { review: YearInReview }) {
  const { t } = useAppTranslation(['career']);
  const formatDate = useDateFormat();
  const { summary, biggestImprovement, nextChallenge, roleChanges } = review;

  return (
    <Card variant="outlined" padding="md" className="gap-3" testID="year-in-review">
      <Text variant="body" className="font-sans-semibold" accessibilityRole="header">
        {t('career:review.title', { season: summary.season })}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Stat label={t('career:review.matches')} value={summary.matches} />
        <Stat label={t('career:review.minutes')} value={summary.minutes} />
        <Stat label={t('career:review.goals')} value={summary.goals} />
        <Stat label={t('career:review.assists')} value={summary.assists} />
      </View>
      {summary.positions.length > 0 ? (
        <Text variant="body-sm">
          {t('career:review.positions', {
            list: summary.positions.map((item) => `${item.position} (${item.matches})`).join(', '),
          })}
        </Text>
      ) : null}
      {summary.clubs.length > 0 ? (
        <Text variant="body-sm">{t('career:review.clubs', { list: summary.clubs.join(', ') })}</Text>
      ) : null}
      <Text variant="body-sm" color="secondary">
        {t('career:review.activity', { trials: summary.trials, reels: summary.reels, clips: summary.clips })}
      </Text>
      {summary.goalsAchieved > 0 ? (
        <Text variant="body-sm">{t('career:review.goalsAchieved', { count: summary.goalsAchieved })}</Text>
      ) : null}
      {roleChanges.map((item) => (
        <Text key={item.id} variant="body-sm">
          {item.kind === 'position_change'
            ? t('career:review.positionChange', { from: item.previous ?? '—', to: item.subject })
            : t('career:review.clubChange', { to: item.subject })}
        </Text>
      ))}
      <Text variant="body-sm">
        {summary.bestMatch
          ? t('career:review.strongest', {
              goals: summary.bestMatch.goals,
              assists: summary.bestMatch.assists,
              opponent: summary.bestMatch.opponent,
              date: formatDate(summary.bestMatch.date),
            })
          : t('career:review.noStrongest')}
      </Text>
      <Text variant="body-sm" color="secondary">
        {biggestImprovement
          ? t('career:review.improvement', {
              season: biggestImprovement.previousSeason,
              metric: t(`career:review.metric.${biggestImprovement.key}`),
              delta: biggestImprovement.delta,
            })
          : t('career:review.noImprovement', { count: MIN_COMPARISON_MATCHES })}
      </Text>
      <View className="rounded-lg bg-accent-muted px-3 py-2">
        <Text variant="body-sm" weight="semibold">
          {nextChallenge.kind === 'goal'
            ? t('career:review.next.goal', { title: nextChallenge.title })
            : t(`career:review.next.${nextChallenge.kind}`, { count: MIN_COMPARISON_MATCHES })}
        </Text>
      </View>
      <Text variant="caption" color="tertiary">
        {t('career:storyLabel')}
      </Text>
    </Card>
  );
}

export function SeasonComparisonCard({ comparison }: { comparison: SeasonComparison }) {
  const { t } = useAppTranslation(['career']);
  return (
    <Card variant="outlined" padding="md" className="gap-2" testID="season-comparison">
      <Text variant="body" className="font-sans-semibold" accessibilityRole="header">
        {t('career:review.compareTitle', { current: comparison.current, previous: comparison.previous })}
      </Text>
      {!comparison.sufficient ? (
        <Text variant="body-sm" color="secondary">
          {t('career:review.compareInsufficient', { count: MIN_COMPARISON_MATCHES })}
        </Text>
      ) : (
        comparison.metrics.map((metric) => (
          <View key={metric.key} className="flex-row items-center justify-between gap-2">
            <Text variant="body-sm" className="flex-1">
              {t(`career:review.metric.${metric.key}`)}
            </Text>
            <Text variant="body-sm" color="secondary">
              {metric.previous} → {metric.current}
            </Text>
            <Text
              variant="body-sm"
              weight="semibold"
              accessibilityLabel={t('career:review.deltaLabel', { delta: metric.delta })}
            >
              {metric.delta > 0 ? `▲ +${metric.delta}` : metric.delta < 0 ? `▼ ${metric.delta}` : '= 0'}
            </Text>
          </View>
        ))
      )}
    </Card>
  );
}

export function CareerFirstsCard({ firsts, limit }: { firsts: readonly CareerFirst[]; limit?: number }) {
  const { t } = useAppTranslation(['career']);
  const formatDate = useDateFormat();
  const visible = limit ? firsts.slice(0, limit) : firsts;
  return (
    <Card variant="outlined" padding="md" className="gap-2" testID="career-firsts">
      <Text variant="body" className="font-sans-semibold" accessibilityRole="header">
        {t('career:firsts.title')}
      </Text>
      {visible.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('career:firsts.empty')}
        </Text>
      ) : (
        visible.map((item) => (
          <View key={item.id} className="gap-0.5">
            <Text variant="body-sm">
              {t(`career:firsts.${item.kind}`, { subject: item.subject, previous: item.previous ?? '—' })}
            </Text>
            <Text variant="caption" color="secondary">
              {formatDate(item.date)}
            </Text>
          </View>
        ))
      )}
    </Card>
  );
}

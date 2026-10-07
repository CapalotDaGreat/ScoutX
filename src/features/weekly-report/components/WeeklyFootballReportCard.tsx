import { useMemo } from 'react';
import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { StatCard } from '@/components/primitives/StatCard';
import { Text } from '@/components/primitives/Text';
import { usePortfolioAnalytics } from '@/features/portfolio-analytics/hooks/usePortfolioAnalytics';
import { buildWeeklyGrowthMetrics } from '@/features/player-growth/services/growthMetricsService';
import { type PlayerProfile } from '@/features/player-profile/types';
import { type TrustRecommendation } from '@/features/trust-system/types';
import { buildWeeklyFootballReport } from '@/features/weekly-report/services/weeklyReportService';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type WeeklyFootballReportCardProps = {
  profile: PlayerProfile;
  recommendations?: TrustRecommendation[];
};

export function WeeklyFootballReportCard({
  profile,
  recommendations = [],
}: WeeklyFootballReportCardProps) {
  const { t, i18n } = useAppTranslation('career');
  const { analytics } = usePortfolioAnalytics(profile.id);
  const growth = useMemo(() => buildWeeklyGrowthMetrics(profile), [profile]);
  const report = useMemo(
    () => buildWeeklyFootballReport(profile, growth, analytics, recommendations),
    [analytics, growth, profile, recommendations],
  );
  const weekLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' });
    return `${formatter.format(report.weekStart)} – ${formatter.format(report.weekEnd)}`;
  }, [i18n.language, report.weekEnd, report.weekStart]);

  const hasActivity =
    report.growth.matchCount > 0 ||
    report.portfolioViewsThisWeek > 0 ||
    report.scoutViewsThisWeek > 0;

  if (!hasActivity && (profile.statisticsMatches?.length ?? 0) === 0) {
    return (
      <Card variant="outlined" padding="md" className="gap-2">
        <Text variant="overline" color="secondary">
          {t('weekly.overline')}
        </Text>
        <Text weight="semibold">{t('weekly.emptyTitle')}</Text>
        <Text variant="body-sm" color="secondary">
          {t('weekly.emptyBody')}
        </Text>
      </Card>
    );
  }

  return (
    <Card variant="default" padding="md" className="gap-3">
      <View>
        <Text variant="overline" color="secondary">
          {t('weekly.overline')}
        </Text>
        <Text weight="semibold">{weekLabel}</Text>
        <Text variant="caption" color="secondary">
          {t('weekly.scores', { passport: report.passportScore, scout: report.scoutVisibleScore })}
        </Text>
      </View>

      {report.highlights.length > 0 ? (
        <View className="gap-1">
          {report.highlights.map((line) => (
            <Text key={line.kind} variant="body-sm">
              • {t(`weekly.highlight.${line.kind}`, { count: line.count })}
            </Text>
          ))}
        </View>
      ) : null}

      <View className="flex-row flex-wrap gap-3">
        <StatCard
          label={t('weekly.stat.goals')}
          value={report.growth.goals.current ?? '—'}
          trend={
            report.growth.goals.delta
              ? { value: report.growth.goals.delta, direction: report.growth.goals.direction }
              : undefined
          }
          className="min-w-[45%] flex-1"
        />
        <StatCard
          label={t('weekly.stat.assists')}
          value={report.growth.assists.current ?? '—'}
          trend={
            report.growth.assists.delta
              ? { value: report.growth.assists.delta, direction: report.growth.assists.direction }
              : undefined
          }
          className="min-w-[45%] flex-1"
        />
        <StatCard
          label={t('weekly.stat.passAccuracy')}
          value={report.growth.passAccuracy.current === null ? '—' : `${report.growth.passAccuracy.current}%`}
          trend={
            report.growth.passAccuracy.delta
              ? { value: report.growth.passAccuracy.delta, direction: report.growth.passAccuracy.direction }
              : undefined
          }
          className="min-w-[45%] flex-1"
        />
        <StatCard
          label={t('weekly.stat.portfolioViews')}
          value={report.portfolioViewsThisWeek}
          trend={{
            value: t('weekly.stat.scoutViews', { count: report.scoutViewsThisWeek }),
            direction: report.scoutViewsThisWeek > 0 ? 'up' : 'neutral',
          }}
          className="min-w-[45%] flex-1"
        />
      </View>

      {report.suggestions.length > 0 ? (
        <View className="rounded-xl bg-background-secondary p-3">
          <Text weight="semibold" className="text-sm">
            {t('weekly.focusTitle')}
          </Text>
          {report.suggestions.map((id) => (
            <Text key={id} variant="body-sm" color="secondary">
              • {t(`weekly.suggestion.${id}`)}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

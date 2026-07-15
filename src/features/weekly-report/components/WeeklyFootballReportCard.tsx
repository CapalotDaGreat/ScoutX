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

export type WeeklyFootballReportCardProps = {
  profile: PlayerProfile;
  recommendations?: TrustRecommendation[];
};

export function WeeklyFootballReportCard({
  profile,
  recommendations = [],
}: WeeklyFootballReportCardProps) {
  const { analytics } = usePortfolioAnalytics(profile.id);
  const growth = useMemo(() => buildWeeklyGrowthMetrics(profile), [profile]);
  const report = useMemo(
    () => buildWeeklyFootballReport(profile, growth, analytics, recommendations),
    [analytics, growth, profile, recommendations],
  );

  const hasActivity =
    report.growth.matchCount > 0 ||
    report.portfolioViewsThisWeek > 0 ||
    report.scoutViewsThisWeek > 0;

  if (!hasActivity && (profile.statisticsMatches?.length ?? 0) === 0) {
    return (
      <Card variant="outlined" padding="md" className="gap-2">
        <Text variant="overline" color="secondary">
          Weekly Football Report
        </Text>
        <Text weight="semibold">Your intelligent weekly summary</Text>
        <Text variant="body-sm" color="secondary">
          Log your first match or publish your Football Passport to unlock a personalized weekly
          report.
        </Text>
      </Card>
    );
  }

  return (
    <Card variant="default" padding="md" className="gap-3">
      <View>
        <Text variant="overline" color="secondary">
          Weekly Football Report
        </Text>
        <Text weight="semibold">{report.weekLabel}</Text>
        <Text variant="caption" color="secondary">
          Passport score {report.passportScore}/100 · Scout-visible {report.scoutVisibleScore}/100
        </Text>
      </View>

      {report.highlights.length > 0 ? (
        <View className="gap-1">
          {report.highlights.map((line) => (
            <Text key={line} variant="body-sm">
              • {line}
            </Text>
          ))}
        </View>
      ) : null}

      <View className="flex-row flex-wrap gap-3">
        <StatCard
          label="Goals"
          value={report.growth.goals.current}
          trend={{ value: report.growth.goals.delta, direction: report.growth.goals.direction }}
          className="min-w-[45%] flex-1"
        />
        <StatCard
          label="Assists"
          value={report.growth.assists.current}
          trend={{ value: report.growth.assists.delta, direction: report.growth.assists.direction }}
          className="min-w-[45%] flex-1"
        />
        <StatCard
          label="Pass accuracy"
          value={`${report.growth.passAccuracy.current}%`}
          trend={{
            value: report.growth.passAccuracy.delta,
            direction: report.growth.passAccuracy.direction,
          }}
          className="min-w-[45%] flex-1"
        />
        <StatCard
          label="Portfolio views"
          value={report.portfolioViewsThisWeek}
          trend={{
            value: `${report.scoutViewsThisWeek} scout`,
            direction: report.scoutViewsThisWeek > 0 ? 'up' : 'neutral',
          }}
          className="min-w-[45%] flex-1"
        />
      </View>

      {report.suggestions.length > 0 ? (
        <View className="rounded-xl bg-neutral-50 p-3">
          <Text weight="semibold" className="text-sm">
            Focus this week
          </Text>
          {report.suggestions.map((item) => (
            <Text key={item} variant="body-sm" color="secondary">
              • {item}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

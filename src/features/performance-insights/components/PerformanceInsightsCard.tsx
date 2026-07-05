import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { StatCard } from '@/components/primitives/StatCard';
import { Text } from '@/components/primitives/Text';
import { GpsSessionRepository } from '@/features/gps/repositories/GpsSessionRepository';
import { type GpsSession } from '@/features/gps/types';
import { buildWeeklyGrowthMetrics } from '@/features/player-growth/services/growthMetricsService';
import { buildPerformanceInsightsReport } from '@/features/performance-insights/services/performanceInsightsService';
import { usePortfolioAnalytics } from '@/features/portfolio-analytics/hooks/usePortfolioAnalytics';
import { type PlayerProfile } from '@/features/player-profile/types';

export type PerformanceInsightsCardProps = {
  profile: PlayerProfile;
};

export function PerformanceInsightsCard({ profile }: PerformanceInsightsCardProps) {
  const { analytics } = usePortfolioAnalytics(profile.id);
  const [gpsSessions, setGpsSessions] = useState<GpsSession[]>([]);
  const growth = useMemo(() => buildWeeklyGrowthMetrics(profile), [profile]);

  useEffect(() => {
    void GpsSessionRepository.getInstance()
      .fetchSessions(profile.id)
      .then((sessions) => setGpsSessions(sessions.slice(0, 5)))
      .catch(() => undefined);
  }, [profile.id]);

  const report = useMemo(
    () =>
      buildPerformanceInsightsReport({
        profile,
        growth,
        analytics,
        gpsSessions,
      }),
    [analytics, gpsSessions, growth, profile],
  );

  return (
    <Card variant="outlined" padding="md" className="gap-3">
      <View>
        <Text variant="overline" color="secondary">
          Performance insights
        </Text>
        <Text weight="semibold">Your football development dashboard</Text>
        <Text variant="caption" color="secondary">
          Match performance, portfolio reach, and GPS load in one view
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-3">
        {report.insights.map((insight) => (
          <StatCard
            key={insight.id}
            label={insight.label}
            value={insight.value}
            trend={{ value: insight.hint.slice(0, 12), direction: insight.trend }}
            className="min-w-[45%] flex-1"
          />
        ))}
      </View>

      <View className="gap-2">
        <Text weight="semibold" className="text-sm">
          Skill radar snapshot
        </Text>
        {report.radarSnapshot.map((item) => (
          <View key={item.label} className="gap-1">
            <View className="flex-row items-center justify-between">
              <Text variant="body-sm">{item.label}</Text>
              <Text variant="caption" color="secondary">
                {item.value}/{item.max}
              </Text>
            </View>
            <View className="h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
              <View
                className="h-full rounded-full bg-green-600"
                style={{ width: `${Math.min(100, (item.value / item.max) * 100)}%` }}
              />
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

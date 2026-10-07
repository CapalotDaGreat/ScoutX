import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { StatCard } from '@/components/primitives/StatCard';
import { Text } from '@/components/primitives/Text';
import { GpsSessionRepository } from '@/features/gps/repositories/GpsSessionRepository';
import { type GpsSession } from '@/features/gps/types';
import { buildWeeklyGrowthMetrics } from '@/features/player-growth/services/growthMetricsService';
import {
  buildPerformanceInsightsReport,
  type PerformanceInsight,
} from '@/features/performance-insights/services/performanceInsightsService';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { usePortfolioAnalytics } from '@/features/portfolio-analytics/hooks/usePortfolioAnalytics';
import { type PlayerProfile } from '@/features/player-profile/types';

export type PerformanceInsightsCardProps = {
  profile: PlayerProfile;
};

function formatInsightValue(insight: PerformanceInsight): string {
  if (insight.value === null) return '—';
  if (insight.id === 'passAccuracy') return `${insight.value}%`;
  if (insight.id === 'portfolioStrength') return `${insight.value}/100`;
  if (insight.id === 'gpsDistance') return `${insight.value} km`;
  return String(insight.value);
}

export function PerformanceInsightsCard({ profile }: PerformanceInsightsCardProps) {
  const { t } = useAppTranslation('career');
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
          {t('insights.overline')}
        </Text>
        <Text weight="semibold">{t('insights.title')}</Text>
        <Text variant="caption" color="secondary">
          {t('insights.subtitle')}
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-3">
        {report.insights.map((insight) => (
          <View key={insight.id} className="min-w-[45%] flex-1 gap-1">
            <StatCard
              label={t(`insights.item.${insight.id}.label`)}
              value={formatInsightValue(insight)}
              trend={insight.delta ? { value: insight.delta, direction: insight.trend } : undefined}
            />
            <Text variant="caption" color="secondary" className="px-1">
              {t(`insights.item.${insight.id}.hint`)}
            </Text>
          </View>
        ))}
      </View>

      {report.radarSnapshot.length > 0 ? (
      <View className="gap-2">
        <Text weight="semibold" className="text-sm">
          {t('insights.snapshotTitle')}
        </Text>
        {report.radarSnapshot.map((item) => (
          <View key={item.label} className="gap-1">
            <View className="flex-row items-center justify-between">
              <Text variant="body-sm">{item.label}</Text>
              <Text variant="caption" color="secondary">
                {item.value}/{item.max}
              </Text>
            </View>
            <View className="h-2 overflow-hidden rounded-full bg-background-secondary">
              <View
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.min(100, (item.value / item.max) * 100)}%` }}
              />
            </View>
          </View>
        ))}
      </View>
      ) : null}
    </Card>
  );
}

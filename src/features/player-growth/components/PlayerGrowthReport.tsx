import { useMemo } from 'react';
import { View } from 'react-native';
import { StatCard } from '@/components/primitives/StatCard';
import { Text } from '@/components/primitives/Text';
import { buildWeeklyGrowthMetrics } from '@/features/player-growth/services/growthMetricsService';
import { type PlayerProfile } from '@/features/player-profile/types';

export type PlayerGrowthReportProps = {
  profile: PlayerProfile;
};

export function PlayerGrowthReport({ profile }: PlayerGrowthReportProps) {
  const matches = profile.statisticsMatches ?? [];
  const report = useMemo(() => buildWeeklyGrowthMetrics(profile), [matches]);

  if (matches.length === 0) {
    return null;
  }

  return (
    <View className="gap-3 rounded-2xl border border-border bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <View>
        <Text variant="overline" color="secondary">
          Weekly growth
        </Text>
        <Text weight="semibold">Last 7 days vs previous week</Text>
        <Text variant="caption" color="secondary">
          {report.matchCount} match{report.matchCount === 1 ? '' : 'es'} logged this week
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-3">
        <StatCard
          label="Goals"
          value={report.goals.current}
          trend={{ value: report.goals.delta, direction: report.goals.direction }}
          className="min-w-[45%] flex-1"
        />
        <StatCard
          label="Assists"
          value={report.assists.current}
          trend={{ value: report.assists.delta, direction: report.assists.direction }}
          className="min-w-[45%] flex-1"
        />
        <StatCard
          label="Pass accuracy"
          value={`${report.passAccuracy.current}%`}
          trend={{ value: report.passAccuracy.delta, direction: report.passAccuracy.direction }}
          className="min-w-[45%] flex-1"
        />
        <StatCard
          label="Tackles"
          value={report.tackles.current}
          trend={{ value: report.tackles.delta, direction: report.tackles.direction }}
          className="min-w-[45%] flex-1"
        />
      </View>
    </View>
  );
}

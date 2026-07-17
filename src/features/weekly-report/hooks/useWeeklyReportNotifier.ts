import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityRecorder } from '@/features/activity-feed/services/activityRecorder';
import { buildWeeklyFootballReport } from '@/features/weekly-report/services/weeklyReportService';
import { buildWeeklyGrowthMetrics } from '@/features/player-growth/services/growthMetricsService';
import { type PortfolioAnalytics } from '@/features/portfolio-analytics/repositories/PortfolioAnalyticsRepository';
import { type PlayerProfile } from '@/features/player-profile/types';
import { type TrustRecommendation } from '@/features/trust-system/types';
import { startOfWeekMondayKey } from '@/utils/dateWeek';

const STORAGE_PREFIX = '@scoutx/weekly-report-notified/';

export function useWeeklyReportNotifier(
  profile: PlayerProfile | null,
  analytics: PortfolioAnalytics,
  recommendations: TrustRecommendation[],
): void {
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!profile?.id || notifiedRef.current) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      const weekKey = startOfWeekMondayKey();
      const storageKey = `${STORAGE_PREFIX}${profile.id}/${weekKey}`;
      const alreadyNotified = await AsyncStorage.getItem(storageKey);
      if (alreadyNotified === 'true') {
        return;
      }

      const growth = buildWeeklyGrowthMetrics(profile);
      const report = buildWeeklyFootballReport(profile, growth, analytics, recommendations);
      const hasActivity =
        report.growth.matchCount > 0 ||
        report.portfolioViewsThisWeek > 0 ||
        report.scoutViewsThisWeek > 0;

      if (!hasActivity) {
        return;
      }

      ActivityRecorder.getInstance().recordWeeklyReportReady({
        playerId: profile.id,
        playerName: profile.fullName,
        summary: report.summary,
      });

      if (!cancelled) {
        await AsyncStorage.setItem(storageKey, 'true');
        notifiedRef.current = true;
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [analytics, profile, recommendations]);
}

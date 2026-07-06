import { type GpsSession } from '@/features/gps/types';
import { type WeeklyGrowthMetrics } from '@/features/player-growth/services/growthMetricsService';
import { type PlayerProfile } from '@/features/player-profile/types';
import { type PortfolioAnalytics } from '@/features/portfolio-analytics/repositories/PortfolioAnalyticsRepository';
import { getPortfolioOverallScore } from '@/features/public-portfolio/services/footballPassportScoreService';

export type PerformanceInsight = {
  id: string;
  label: string;
  value: string;
  trend: 'up' | 'down' | 'neutral';
  hint: string;
};

export type PerformanceInsightsReport = {
  insights: PerformanceInsight[];
  radarSnapshot: Array<{ label: string; value: number; max: number }>;
};

function trendFromDelta(delta: string): PerformanceInsight['trend'] {
  if (delta.startsWith('+')) {
    return 'up';
  }
  if (delta.startsWith('-')) {
    return 'down';
  }
  return 'neutral';
}

export function buildPerformanceInsightsReport(input: {
  profile: PlayerProfile;
  growth: WeeklyGrowthMetrics;
  analytics: PortfolioAnalytics;
  gpsSessions: GpsSession[];
}): PerformanceInsightsReport {
  const { profile, growth, analytics, gpsSessions } = input;
  const passportScore = getPortfolioOverallScore(profile);
  const matchCount = profile.statisticsMatches?.length ?? 0;
  const gpsDistance = gpsSessions.reduce((sum, session) => sum + session.metrics.distanceM, 0);

  const insights: PerformanceInsight[] = [
    {
      id: 'weekly-matches',
      label: 'Weekly matches',
      value: String(growth.matchCount),
      trend: growth.matchCount > 0 ? 'up' : 'neutral',
      hint: 'Consistency helps scouts trust your development curve.',
    },
    {
      id: 'goal-contribution',
      label: 'Goal contribution',
      value: String(growth.goals.current + growth.assists.current),
      trend: trendFromDelta(growth.goals.delta),
      hint: 'Goals plus assists from the last 7 days.',
    },
    {
      id: 'pass-accuracy',
      label: 'Pass accuracy',
      value: `${growth.passAccuracy.current}%`,
      trend: trendFromDelta(growth.passAccuracy.delta),
      hint: 'Weekly passing efficiency trend.',
    },
    {
      id: 'portfolio-strength',
      label: 'Portfolio strength',
      value: `${passportScore}/100`,
      trend: passportScore >= 70 ? 'up' : 'neutral',
      hint: 'Complete passport items to improve scout conversion.',
    },
    {
      id: 'scout-visibility',
      label: 'Scout views (week)',
      value: String(analytics.scoutViewsThisWeek),
      trend: analytics.scoutViewsThisWeek > 0 ? 'up' : 'neutral',
      hint: 'Scouts who opened your Football Passport this week.',
    },
    {
      id: 'gps-load',
      label: 'GPS distance (recent)',
      value: gpsDistance > 0 ? `${Math.round(gpsDistance / 1000)} km` : '—',
      trend: gpsDistance > 0 ? 'up' : 'neutral',
      hint: 'Total distance from your latest GPS sessions.',
    },
  ];

  const radarSnapshot = profile.performanceSummary.map((item) => ({
    label: item.label,
    value: item.value,
    max: item.max,
  }));

  if (matchCount === 0 && radarSnapshot.length === 0) {
    return {
      insights,
      radarSnapshot: [
        { label: 'Matches logged', value: 0, max: 10 },
        { label: 'Passport score', value: passportScore / 10, max: 10 },
      ],
    };
  }

  return { insights, radarSnapshot };
}

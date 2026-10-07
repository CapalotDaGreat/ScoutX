import { type GpsSession } from '@/features/gps/types';
import { type WeeklyGrowthMetrics } from '@/features/player-growth/services/growthMetricsService';
import { type PlayerProfile } from '@/features/player-profile/types';
import { type PortfolioAnalytics } from '@/features/portfolio-analytics/repositories/PortfolioAnalyticsRepository';
import { getPortfolioOverallScore } from '@/features/public-portfolio/services/footballPassportScoreService';

export type PerformanceInsightId =
  | 'weeklyMatches'
  | 'goalContribution'
  | 'passAccuracy'
  | 'portfolioStrength'
  | 'scoutViews'
  | 'gpsDistance';

export type PerformanceInsight = {
  id: PerformanceInsightId;
  /** Null when there is nothing recorded to show. */
  value: number | null;
  /** Week-over-week change; null when there is no previous week to compare. */
  delta: string | null;
  trend: 'up' | 'down' | 'neutral';
};

export type PerformanceInsightsReport = {
  insights: PerformanceInsight[];
  /** Player-entered performance summary items. */
  radarSnapshot: Array<{ label: string; value: number; max: number }>;
};

export function buildPerformanceInsightsReport(input: {
  profile: PlayerProfile;
  growth: WeeklyGrowthMetrics;
  analytics: PortfolioAnalytics;
  gpsSessions: GpsSession[];
}): PerformanceInsightsReport {
  const { profile, growth, analytics, gpsSessions } = input;
  const passportScore = getPortfolioOverallScore(profile);
  const gpsDistance = gpsSessions.reduce((sum, session) => sum + session.metrics.distanceM, 0);

  const contribution =
    growth.goals.current === null || growth.assists.current === null
      ? null
      : growth.goals.current + growth.assists.current;

  const insights: PerformanceInsight[] = [
    { id: 'weeklyMatches', value: growth.matchCount, delta: null, trend: 'neutral' },
    { id: 'goalContribution', value: contribution, delta: growth.goals.delta, trend: growth.goals.direction },
    {
      id: 'passAccuracy',
      value: growth.passAccuracy.current,
      delta: growth.passAccuracy.delta,
      trend: growth.passAccuracy.direction,
    },
    { id: 'portfolioStrength', value: passportScore, delta: null, trend: 'neutral' },
    { id: 'scoutViews', value: analytics.scoutViewsThisWeek, delta: null, trend: 'neutral' },
    {
      id: 'gpsDistance',
      value: gpsSessions.length > 0 ? Math.round(gpsDistance / 100) / 10 : null,
      delta: null,
      trend: 'neutral',
    },
  ];

  const radarSnapshot = profile.performanceSummary.map((item) => ({
    label: item.label,
    value: item.value,
    max: item.max,
  }));

  return { insights, radarSnapshot };
}

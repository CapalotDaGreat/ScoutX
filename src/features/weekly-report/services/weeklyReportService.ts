import { type PortfolioAnalytics } from '@/features/portfolio-analytics/repositories/PortfolioAnalyticsRepository';
import { type WeeklyGrowthMetrics } from '@/features/player-growth/services/growthMetricsService';
import { type PlayerProfile } from '@/features/player-profile/types';
import { buildFootballPassportScoreReport } from '@/features/public-portfolio/services/footballPassportScoreService';
import { type TrustRecommendation } from '@/features/trust-system/types';

export type WeeklyHighlightKind = 'matches' | 'goals' | 'scoutViews' | 'milestones';

export type WeeklyHighlight = { kind: WeeklyHighlightKind; count: number };

export const WEEKLY_SUGGESTION_IDS = [
  'avatar',
  'bio',
  'position',
  'club',
  'matches',
  'videos',
  'journey',
  'username',
  'public',
  'discoverable',
  'coach',
  'video',
  'match',
  'logMore',
  'share',
] as const;

export type WeeklySuggestionId = (typeof WEEKLY_SUGGESTION_IDS)[number];

export type WeeklyFootballReport = {
  weekStart: Date;
  weekEnd: Date;
  growth: WeeklyGrowthMetrics;
  portfolioViewsThisWeek: number;
  scoutViewsThisWeek: number;
  passportScore: number;
  scoutVisibleScore: number;
  highlights: WeeklyHighlight[];
  suggestions: WeeklySuggestionId[];
};

function isWeeklySuggestionId(value: string): value is WeeklySuggestionId {
  return (WEEKLY_SUGGESTION_IDS as readonly string[]).includes(value);
}

function buildHighlights(
  profile: PlayerProfile,
  growth: WeeklyGrowthMetrics,
  analytics: PortfolioAnalytics,
): WeeklyHighlight[] {
  const highlights: WeeklyHighlight[] = [];
  if (growth.matchCount > 0) highlights.push({ kind: 'matches', count: growth.matchCount });
  if (growth.goals.current !== null && growth.goals.current > 0) {
    highlights.push({ kind: 'goals', count: growth.goals.current });
  }
  if (analytics.scoutViewsThisWeek > 0) {
    highlights.push({ kind: 'scoutViews', count: analytics.scoutViewsThisWeek });
  }
  const milestones = profile.earnedMilestones?.length ?? 0;
  if (milestones > 0) highlights.push({ kind: 'milestones', count: milestones });
  return highlights.slice(0, 4);
}

/** Player-facing next steps only; the store-readiness section is an operator checklist. */
function buildSuggestions(
  profile: PlayerProfile,
  recommendations: TrustRecommendation[],
): WeeklySuggestionId[] {
  const report = buildFootballPassportScoreReport(profile, recommendations);
  const incomplete = report.sections
    .filter((section) => section.id !== 'launchReady')
    .flatMap((section) => section.items)
    .filter((item) => !item.complete)
    .map((item) => item.id)
    .filter(isWeeklySuggestionId);
  const unique = [...new Set(incomplete)].slice(0, 3);
  if (unique.length > 0) return unique;
  if ((profile.statisticsMatches?.length ?? 0) < 3) return ['logMore'];
  return ['share'];
}

export function buildWeeklyFootballReport(
  profile: PlayerProfile,
  growth: WeeklyGrowthMetrics,
  analytics: PortfolioAnalytics,
  recommendations: TrustRecommendation[] = [],
  now: Date = new Date(),
): WeeklyFootballReport {
  const passportReport = buildFootballPassportScoreReport(profile, recommendations);
  const scoutSection = passportReport.sections.find((section) => section.id === 'scoutVisible');
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);

  return {
    weekStart,
    weekEnd: now,
    growth,
    portfolioViewsThisWeek: analytics.viewsThisWeek,
    scoutViewsThisWeek: analytics.scoutViewsThisWeek,
    passportScore: passportReport.overallScore,
    scoutVisibleScore: scoutSection?.score ?? 0,
    highlights: buildHighlights(profile, growth, analytics),
    suggestions: buildSuggestions(profile, recommendations),
  };
}

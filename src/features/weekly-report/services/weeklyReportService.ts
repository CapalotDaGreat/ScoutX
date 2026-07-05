import { type PortfolioAnalytics } from '@/features/portfolio-analytics/repositories/PortfolioAnalyticsRepository';
import { type WeeklyGrowthMetrics } from '@/features/player-growth/services/growthMetricsService';
import { type PlayerProfile } from '@/features/player-profile/types';
import { buildFootballPassportScoreReport } from '@/features/public-portfolio/services/footballPassportScoreService';
import { type TrustRecommendation } from '@/features/trust-system/types';

export type WeeklyFootballReport = {
  weekLabel: string;
  growth: WeeklyGrowthMetrics;
  portfolioViewsThisWeek: number;
  scoutViewsThisWeek: number;
  passportScore: number;
  scoutVisibleScore: number;
  highlights: string[];
  suggestions: string[];
  summary: string;
};

function currentWeekLabel(): string {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  return `${formatter.format(start)} – ${formatter.format(now)}`;
}

function buildHighlights(
  profile: PlayerProfile,
  growth: WeeklyGrowthMetrics,
  analytics: PortfolioAnalytics,
): string[] {
  const highlights: string[] = [];

  if (growth.matchCount > 0) {
    highlights.push(
      `Logged ${growth.matchCount} match${growth.matchCount === 1 ? '' : 'es'} this week.`,
    );
  }
  if (growth.goals.current > 0) {
    highlights.push(`Scored ${growth.goals.current} goal${growth.goals.current === 1 ? '' : 's'}.`);
  }
  if (analytics.scoutViewsThisWeek > 0) {
    highlights.push(
      `${analytics.scoutViewsThisWeek} scout view${analytics.scoutViewsThisWeek === 1 ? '' : 's'} on your Football Passport.`,
    );
  }
  if ((profile.earnedMilestones?.length ?? 0) > 0) {
    highlights.push(`${profile.earnedMilestones?.length ?? 0} professional milestones earned.`);
  }

  return highlights.slice(0, 4);
}

function buildSuggestions(profile: PlayerProfile, recommendations: TrustRecommendation[]): string[] {
  const report = buildFootballPassportScoreReport(profile, recommendations);
  const incomplete = report.sections
    .flatMap((section) => section.items)
    .filter((item) => !item.complete)
    .slice(0, 3)
    .map((item) => item.hint);

  if (incomplete.length > 0) {
    return incomplete;
  }

  if ((profile.statisticsMatches?.length ?? 0) < 3) {
    return ['Log more matches to strengthen your weekly performance story.'];
  }

  return ['Share your Football Passport link to grow scout visibility this week.'];
}

function buildSummary(highlights: string[], suggestions: string[]): string {
  const lead = highlights[0] ?? 'Your weekly football report is ready.';
  const action = suggestions[0] ?? 'Keep building your portfolio.';
  return `${lead} Next step: ${action}`;
}

export function buildWeeklyFootballReport(
  profile: PlayerProfile,
  growth: WeeklyGrowthMetrics,
  analytics: PortfolioAnalytics,
  recommendations: TrustRecommendation[] = [],
): WeeklyFootballReport {
  const passportReport = buildFootballPassportScoreReport(profile, recommendations);
  const scoutSection = passportReport.sections.find((section) => section.id === 'scoutVisible');
  const highlights = buildHighlights(profile, growth, analytics);
  const suggestions = buildSuggestions(profile, recommendations);

  return {
    weekLabel: currentWeekLabel(),
    growth,
    portfolioViewsThisWeek: analytics.viewsThisWeek,
    scoutViewsThisWeek: analytics.scoutViewsThisWeek,
    passportScore: passportReport.overallScore,
    scoutVisibleScore: scoutSection?.score ?? 0,
    highlights,
    suggestions,
    summary: buildSummary(highlights, suggestions),
  };
}

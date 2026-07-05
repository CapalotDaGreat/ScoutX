import { type PortfolioAnalytics } from '@/features/portfolio-analytics/repositories/PortfolioAnalyticsRepository';
import { type CareerReplayData } from '@/features/career-replay/types';
import { listEarnedMilestoneDefinitions } from '@/features/career-milestones/services/milestoneService';
import { type PlayerProfile } from '@/features/player-profile/types';
import { calculatePlayerStatistics } from '@/features/player-statistics/services/statisticsCalculator';

function currentSeasonLabel(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 6 ? year : year - 1;
  return `${startYear}/${String(startYear + 1).slice(-2)} Season`;
}

function seasonStartIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 6 ? year : year - 1;
  return new Date(startYear, 6, 1).toISOString();
}

export function buildCareerReplayData(
  profile: PlayerProfile,
  analytics: PortfolioAnalytics,
): CareerReplayData {
  const seasonStart = seasonStartIso();
  const seasonMatches = (profile.statisticsMatches ?? []).filter(
    (match) => new Date(match.date).getTime() >= new Date(seasonStart).getTime(),
  );
  const stats = calculatePlayerStatistics(seasonMatches);
  const goals = stats.totals.find((item) => item.key === 'goals')?.value ?? 0;
  const assists = stats.totals.find((item) => item.key === 'assists')?.value ?? 0;
  const bestMatch = seasonMatches.reduce<(typeof seasonMatches)[number] | null>(
    (best, match) => {
      if (!best || match.matchRating > best.matchRating) {
        return match;
      }
      return best;
    },
    null,
  );

  const milestonesEarned = listEarnedMilestoneDefinitions(profile).length;
  const goalCount = typeof goals === 'number' ? goals : 0;
  const assistCount = typeof assists === 'number' ? assists : 0;

  const highlights: CareerReplayData['highlights'] = [
    { label: 'Matches', value: String(seasonMatches.length) },
    { label: 'Goals', value: String(goalCount) },
    { label: 'Assists', value: String(assistCount) },
    { label: 'Milestones', value: String(milestonesEarned) },
    { label: 'Portfolio views', value: String(analytics.totalViews) },
    { label: 'Scout views', value: String(analytics.scoutViews) },
  ];

  const narrativeParts: string[] = [];
  if (seasonMatches.length > 0) {
    narrativeParts.push(
      `${profile.fullName} logged ${seasonMatches.length} match${seasonMatches.length === 1 ? '' : 'es'} this season.`,
    );
  }
  if (goalCount > 0 || assistCount > 0) {
    narrativeParts.push(`Contributions: ${goalCount} goals and ${assistCount} assists.`);
  }
  if (analytics.scoutViews > 0) {
    narrativeParts.push(`Scouts opened your Football Passport ${analytics.scoutViews} time${analytics.scoutViews === 1 ? '' : 's'}.`);
  }
  if (milestonesEarned > 0) {
    narrativeParts.push(`${milestonesEarned} professional milestone${milestonesEarned === 1 ? '' : 's'} unlocked.`);
  }

  return {
    seasonLabel: currentSeasonLabel(),
    playerName: profile.fullName,
    position: profile.position,
    club: profile.club,
    matchCount: seasonMatches.length,
    totalGoals: goalCount,
    totalAssists: assistCount,
    bestRating: bestMatch?.matchRating ?? null,
    bestRatingOpponent: bestMatch?.opponent ?? null,
    milestonesEarned,
    portfolioViews: analytics.totalViews,
    scoutViews: analytics.scoutViews,
    highlights,
    narrative:
      narrativeParts.join(' ') ||
      'Start logging matches and sharing your Football Passport to build your season replay.',
  };
}

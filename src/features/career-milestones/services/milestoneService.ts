import { type PortfolioAnalytics } from '@/features/portfolio-analytics/repositories/PortfolioAnalyticsRepository';
import { PortfolioAnalyticsRepository } from '@/features/portfolio-analytics/repositories/PortfolioAnalyticsRepository';
import { ActivityRecorder } from '@/features/activity-feed/services/activityRecorder';
import { appendSystemJourneyEvents } from '@/features/career-timeline/services/careerTimelineService';
import { type MilestoneDefinition } from '@/features/career-milestones/types';
import {
  evaluateMilestones,
  resolveEarnedMilestoneDefinitions,
} from '@/features/career-milestones/services/milestoneEngine';
import { PlayerProfileRepository } from '@/features/player-profile/repositories/PlayerProfileRepository';
import { type PlayerProfile } from '@/features/player-profile/types';
import { getPortfolioOverallScore } from '@/features/public-portfolio/services/portfolioHealthService';
import { type TrustRecommendation } from '@/features/trust-system/types';

export function buildMilestoneEvaluationContext(
  profile: PlayerProfile,
  recommendations: TrustRecommendation[],
  analytics: PortfolioAnalytics,
) {
  return {
    matchCount: profile.statisticsMatches?.length ?? 0,
    videoCount: profile.highlightVideos?.videos.length ?? 0,
    coachRecommendations: recommendations.length,
    portfolioPublic: profile.privacy?.publicPortfolioEnabled ?? false,
    discoverable: profile.privacy?.discoverableByScouts ?? false,
    hasUsername: Boolean(profile.username && profile.username.length >= 3),
    hasAvatar: Boolean(profile.avatarUrl),
    scoutViews: analytics.scoutViews,
    portfolioHealthScore: getPortfolioOverallScore(profile, recommendations),
  };
}

function appendMilestoneJourneyEvents(
  profile: PlayerProfile,
  milestones: MilestoneDefinition[],
): PlayerProfile['footballJourney'] {
  let journey = profile.footballJourney;
  for (const milestone of milestones) {
    journey = appendSystemJourneyEvents(journey, {
      type: 'professional_milestone',
      milestone,
    });
  }
  return journey;
}

export async function syncPlayerMilestones(input: {
  profile: PlayerProfile;
  recommendations: TrustRecommendation[];
  analytics: PortfolioAnalytics;
}): Promise<MilestoneDefinition[]> {
  const { profile, recommendations, analytics } = input;
  const existing = profile.earnedMilestones ?? [];
  const context = buildMilestoneEvaluationContext(profile, recommendations, analytics);
  const { newlyEarned, earned } = evaluateMilestones(context, existing);

  if (newlyEarned.length === 0) {
    return [];
  }

  const nextJourney = appendMilestoneJourneyEvents(profile, newlyEarned);
  await PlayerProfileRepository.getInstance().updateProfile(profile.id, {
    earnedMilestones: earned,
    footballJourney: nextJourney,
  });

  const recorder = ActivityRecorder.getInstance();
  for (const milestone of newlyEarned) {
    recorder.recordMilestoneEarned({
      playerId: profile.id,
      playerName: profile.fullName,
      milestoneId: milestone.id,
      milestoneTitle: milestone.title,
      milestoneDescription: milestone.description,
    });
  }

  return newlyEarned;
}

export function listEarnedMilestoneDefinitions(profile: PlayerProfile) {
  return resolveEarnedMilestoneDefinitions(profile.earnedMilestones ?? []);
}

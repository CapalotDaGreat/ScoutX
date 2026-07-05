import {
  getMilestoneDefinition,
  MILESTONE_CATALOG,
} from '@/features/career-milestones/constants/milestoneCatalog';
import {
  type EarnedMilestone,
  type MilestoneDefinition,
  type MilestoneEvaluationContext,
  type MilestoneEvaluationResult,
} from '@/features/career-milestones/types';

function isMilestoneMet(id: string, context: MilestoneEvaluationContext): boolean {
  switch (id) {
    case 'first_match':
      return context.matchCount >= 1;
    case 'ten_matches':
      return context.matchCount >= 10;
    case 'first_highlight':
      return context.videoCount >= 1;
    case 'passport_live':
      return context.portfolioPublic;
    case 'username_claimed':
      return context.hasUsername;
    case 'discoverable':
      return context.discoverable;
    case 'first_endorsement':
      return context.coachRecommendations >= 1;
    case 'first_scout_view':
      return context.scoutViews >= 1;
    case 'portfolio_strong':
      return context.portfolioHealthScore >= 80;
    default:
      return false;
  }
}

export function evaluateMilestones(
  context: MilestoneEvaluationContext,
  existing: EarnedMilestone[] = [],
): MilestoneEvaluationResult {
  const earnedIds = new Set(existing.map((item) => item.id));
  const now = new Date().toISOString();
  const newlyEarned: MilestoneDefinition[] = [];

  for (const definition of MILESTONE_CATALOG) {
    if (earnedIds.has(definition.id)) {
      continue;
    }
    if (isMilestoneMet(definition.id, context)) {
      newlyEarned.push(definition);
      earnedIds.add(definition.id);
    }
  }

  const earned: EarnedMilestone[] = [
    ...existing,
    ...newlyEarned.map((item) => ({ id: item.id, earnedAt: now })),
  ];

  return { newlyEarned, earned };
}

export function resolveEarnedMilestoneDefinitions(
  earned: EarnedMilestone[],
): MilestoneDefinition[] {
  return earned
    .map((item) => getMilestoneDefinition(item.id))
    .filter((item): item is MilestoneDefinition => item !== undefined);
}

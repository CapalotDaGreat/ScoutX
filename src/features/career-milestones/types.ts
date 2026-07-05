export type MilestoneCategory = 'career' | 'portfolio' | 'performance' | 'trust';

export type MilestoneDefinition = {
  id: string;
  title: string;
  description: string;
  category: MilestoneCategory;
  icon: string;
};

export type EarnedMilestone = {
  id: string;
  earnedAt: string;
};

export type MilestoneEvaluationContext = {
  matchCount: number;
  videoCount: number;
  coachRecommendations: number;
  portfolioPublic: boolean;
  discoverable: boolean;
  hasUsername: boolean;
  hasAvatar: boolean;
  scoutViews: number;
  portfolioHealthScore: number;
};

export type MilestoneEvaluationResult = {
  newlyEarned: MilestoneDefinition[];
  earned: EarnedMilestone[];
};

export { MilestonesSection } from '@/features/career-milestones/components/MilestonesSection';
export { usePlayerMilestones } from '@/features/career-milestones/hooks/usePlayerMilestones';
export {
  buildMilestoneEvaluationContext,
  listEarnedMilestoneDefinitions,
  syncPlayerMilestones,
} from '@/features/career-milestones/services/milestoneService';
export { MILESTONE_CATALOG } from '@/features/career-milestones/constants/milestoneCatalog';
export type {
  EarnedMilestone,
  MilestoneCategory,
  MilestoneDefinition,
  MilestoneEvaluationContext,
} from '@/features/career-milestones/types';

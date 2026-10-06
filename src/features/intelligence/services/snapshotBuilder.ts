import type { CoverageState, GoalStatus } from '@/features/development/types';
import type {
  CoverageDimension,
  FootballStateSnapshot,
} from '@/features/intelligence/types';

export type SnapshotSource = {
  now: Date;
  matchIds: readonly string[];
  completedAnalysisIds: readonly string[];
  goals: readonly { id: string; status: GoalStatus }[];
  videoIds: readonly string[];
  trials: readonly { id: string; status: string }[];
  primaryPosition: string | null;
  verificationLevel: string | null;
  coverage: readonly { id: CoverageDimension; state: CoverageState }[];
  endorsementIds: readonly string[];
};

export function buildSnapshot(source: SnapshotSource): FootballStateSnapshot {
  const goalStatus: Record<string, GoalStatus> = {};
  for (const goal of source.goals) goalStatus[goal.id] = goal.status;
  const trialStatus: Record<string, string> = {};
  for (const trial of source.trials) trialStatus[trial.id] = trial.status;
  const coverage: FootballStateSnapshot['coverage'] = {};
  for (const item of source.coverage) coverage[item.id] = item.state;
  return {
    takenAt: source.now.toISOString(),
    matchIds: [...source.matchIds],
    completedAnalysisIds: [...source.completedAnalysisIds],
    goalStatus,
    videoIds: [...source.videoIds],
    trialStatus,
    primaryPosition: source.primaryPosition?.trim() || null,
    verificationLevel: source.verificationLevel,
    coverage,
    endorsementIds: [...source.endorsementIds],
  };
}

import type { CoverageState } from '@/features/development/types';
import type {
  ChangeItem,
  CoverageDimension,
  FootballStateSnapshot,
} from '@/features/intelligence/types';

/** Changes below this significance are considered trivial and are never surfaced. */
export const MIN_CHANGE_SIGNIFICANCE = 2;
const MAX_CHANGES = 6;

const COVERAGE_RANK: Record<CoverageState, number> = {
  insufficient: 0,
  limited: 1,
  moderate: 2,
  strong: 3,
};

const VERIFICATION_RANK: Record<string, number> = { none: 0, basic: 1, verified: 2 };

function added(previous: readonly string[], next: readonly string[]): string[] {
  const seen = new Set(previous);
  return next.filter((id) => !seen.has(id));
}

export function emptySnapshot(takenAt: string): FootballStateSnapshot {
  return {
    takenAt,
    matchIds: [],
    completedAnalysisIds: [],
    goalStatus: {},
    videoIds: [],
    trialStatus: {},
    primaryPosition: null,
    verificationLevel: null,
    coverage: {},
    endorsementIds: [],
  };
}

export function parseSnapshot(value: unknown): FootballStateSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.takenAt !== 'string') return null;
  const strings = (input: unknown): string[] =>
    Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string') : [];
  const stringMap = (input: unknown): Record<string, string> => {
    if (!input || typeof input !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [key, item] of Object.entries(input as Record<string, unknown>)) {
      if (typeof item === 'string') out[key] = item;
    }
    return out;
  };
  return {
    takenAt: record.takenAt,
    matchIds: strings(record.matchIds),
    completedAnalysisIds: strings(record.completedAnalysisIds),
    goalStatus: stringMap(record.goalStatus) as FootballStateSnapshot['goalStatus'],
    videoIds: strings(record.videoIds),
    trialStatus: stringMap(record.trialStatus),
    primaryPosition: typeof record.primaryPosition === 'string' ? record.primaryPosition : null,
    verificationLevel: typeof record.verificationLevel === 'string' ? record.verificationLevel : null,
    coverage: stringMap(record.coverage) as FootballStateSnapshot['coverage'],
    endorsementIds: strings(record.endorsementIds),
  };
}

/**
 * Meaningful differences between two snapshots of the same player's record.
 * Returns nothing when there is no previous snapshot: a first visit has no "since".
 */
export function detectChanges(
  previous: FootballStateSnapshot | null,
  next: FootballStateSnapshot,
): ChangeItem[] {
  if (!previous) return [];
  const changes: ChangeItem[] = [];

  const newMatches = added(previous.matchIds, next.matchIds);
  if (newMatches.length > 0) {
    changes.push({
      id: 'new-matches',
      kind: 'new_matches',
      significance: 3,
      entityId: newMatches[newMatches.length - 1],
      params: { count: newMatches.length },
    });
  }

  for (const id of added(previous.completedAnalysisIds, next.completedAnalysisIds)) {
    changes.push({ id: `analysis-${id}`, kind: 'new_analysis', significance: 4, entityId: id, params: {} });
  }

  for (const [id, status] of Object.entries(next.goalStatus)) {
    const before = previous.goalStatus[id];
    if (before === status) continue;
    if (status === 'achieved') {
      changes.push({ id: `goal-${id}`, kind: 'goal_achieved', significance: 5, entityId: id, params: {} });
    } else if (status === 'improving' && before !== undefined) {
      changes.push({ id: `goal-${id}`, kind: 'goal_improving', significance: 3, entityId: id, params: {} });
    }
  }

  const newVideos = added(previous.videoIds, next.videoIds);
  if (newVideos.length > 0) {
    changes.push({
      id: 'new-videos',
      kind: 'new_video',
      significance: 2,
      entityId: newVideos[newVideos.length - 1],
      params: { count: newVideos.length },
    });
  }

  for (const [id, status] of Object.entries(next.trialStatus)) {
    const before = previous.trialStatus[id];
    if (before === undefined) {
      changes.push({ id: `trial-${id}`, kind: 'new_trial', significance: 5, entityId: id, params: { status } });
    } else if (before !== status) {
      changes.push({
        id: `trial-${id}`,
        kind: 'trial_status',
        significance: 4,
        entityId: id,
        params: { from: before, to: status },
      });
    }
  }

  if (
    previous.primaryPosition &&
    next.primaryPosition &&
    previous.primaryPosition.trim().toLowerCase() !== next.primaryPosition.trim().toLowerCase()
  ) {
    changes.push({
      id: 'role-change',
      kind: 'role_change',
      significance: 4,
      params: { from: previous.primaryPosition, to: next.primaryPosition },
    });
  }

  const verificationBefore = VERIFICATION_RANK[previous.verificationLevel ?? 'none'] ?? 0;
  const verificationNow = VERIFICATION_RANK[next.verificationLevel ?? 'none'] ?? 0;
  if (verificationNow !== verificationBefore) {
    changes.push({
      id: 'verification',
      kind: 'verification_change',
      significance: verificationNow > verificationBefore ? 4 : 3,
      params: { from: previous.verificationLevel ?? 'none', to: next.verificationLevel ?? 'none' },
    });
  }

  for (const dimension of Object.keys(next.coverage) as CoverageDimension[]) {
    const now = next.coverage[dimension];
    const before = previous.coverage[dimension];
    if (!now || !before || now === before) continue;
    const up = COVERAGE_RANK[now] > COVERAGE_RANK[before];
    changes.push({
      id: `coverage-${dimension}`,
      kind: up ? 'coverage_up' : 'coverage_down',
      // Moving between two thin states is noise; only crossing into moderate/strong matters.
      significance: up ? (COVERAGE_RANK[now] >= 2 ? 3 : 1) : COVERAGE_RANK[before] >= 2 ? 2 : 1,
      params: { dimension, from: before, to: now },
    });
  }

  const newEndorsements = added(previous.endorsementIds, next.endorsementIds);
  if (newEndorsements.length > 0) {
    changes.push({
      id: 'endorsements',
      kind: 'new_endorsement',
      significance: 4,
      params: { count: newEndorsements.length },
    });
  }

  return changes
    .filter((change) => change.significance >= MIN_CHANGE_SIGNIFICANCE)
    .map((change, index) => ({ change, index }))
    .sort((a, b) => b.change.significance - a.change.significance || a.index - b.index)
    .slice(0, MAX_CHANGES)
    .map(({ change }) => change);
}

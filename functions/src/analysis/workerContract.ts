/**
 * Contract for a future GPU / computer-vision worker.
 *
 * ScoutX currently samples still frames and reasons over them with a vision LLM.
 * Team detection, pitch mapping, continuous tracking and event detection are not
 * implemented. Those stages must be written as `unavailable`, never `complete`.
 */

export const ANALYSIS_DAILY_QUOTA = 8;
export const ANALYSIS_MAX_ATTEMPTS = 3;
export const ANALYSIS_LEASE_MS = 4 * 60 * 1000;

export const CV_WORKER_STAGES = [
  'match-segmentation',
  'player-tracking',
  'event-detection',
  'tactical-context',
  'role-analysis',
] as const;

export type CvWorkerStageId = (typeof CV_WORKER_STAGES)[number];

export type CvWorkerInput = {
  jobId: string;
  playerId: string;
  videoStoragePath: string;
  durationSec: number;
  targeting: {
    jerseyNumber: string;
    kitPrimaryColor: string;
    kitSecondaryColor: string;
  };
};

export type CvWorkerOutput = {
  stageId: CvWorkerStageId;
  status: 'unavailable';
  reason: string;
};

export const CV_UNAVAILABLE_REASON =
  'Computer-vision worker is not deployed. ScoutX will not invent tracking, pitch maps, or event counts.';

export function dailyQuotaCount(
  storedDay: string | undefined,
  storedCount: number | undefined,
  day: string,
): number {
  return storedDay === day && typeof storedCount === 'number' ? storedCount : 0;
}

export function isDailyQuotaReached(count: number, limit = ANALYSIS_DAILY_QUOTA): boolean {
  return count >= limit;
}

export function unavailableCvOutputs(): CvWorkerOutput[] {
  return CV_WORKER_STAGES.map((stageId) => ({
    stageId,
    status: 'unavailable' as const,
    reason: CV_UNAVAILABLE_REASON,
  }));
}

export function isCvWorkerStage(stageId: string): stageId is CvWorkerStageId {
  return (CV_WORKER_STAGES as readonly string[]).includes(stageId);
}

import type { MatchAnalysisJob, MatchAnalysisJobStatus } from '@/features/match-analysis/types';

const ALLOWED: Record<MatchAnalysisJobStatus, readonly MatchAnalysisJobStatus[]> = {
  draft: ['uploading', 'failed', 'cancelled'],
  uploading: ['queued', 'failed', 'cancelled', 'expired'],
  queued: ['processing', 'failed', 'cancelled'],
  processing: ['complete', 'failed', 'queued', 'cancelled'],
  complete: [],
  failed: ['queued', 'processing'],
  cancelled: [],
  expired: [],
};

export function canTransitionJob(
  from: MatchAnalysisJobStatus,
  to: MatchAnalysisJobStatus,
): boolean {
  if (from === to) {
    return true;
  }
  return ALLOWED[from].includes(to);
}

/** States the server will not move out of on its own (failed can still be retried by the player). */
export function isTerminalJobStatus(status: MatchAnalysisJobStatus): boolean {
  return status === 'complete' || status === 'failed' || status === 'cancelled' || status === 'expired';
}

export function isJobInProgress(job: Pick<MatchAnalysisJob, 'status'> | null): boolean {
  return Boolean(job && (job.status === 'uploading' || job.status === 'queued' || job.status === 'processing'));
}

/** Clips up to 15 minutes may fall back to frames sampled on the phone when server extraction fails. */
export const DEVICE_FALLBACK_MAX_SEC = 15 * 60;

export function canUseDeviceFrameFallback(job: MatchAnalysisJob | null): boolean {
  return Boolean(
    job &&
      job.status === 'failed' &&
      job.errorCode === 'extraction_failed' &&
      (job.measuredDurationSec ?? job.durationSec) <= DEVICE_FALLBACK_MAX_SEC,
  );
}

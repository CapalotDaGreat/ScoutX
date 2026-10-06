import type { MatchAnalysisJobStatus } from '@/features/match-analysis/types';

const ALLOWED: Record<MatchAnalysisJobStatus, readonly MatchAnalysisJobStatus[]> = {
  draft: ['uploading', 'failed'],
  uploading: ['queued', 'failed'],
  queued: ['processing', 'failed'],
  processing: ['complete', 'failed', 'queued'],
  complete: [],
  failed: ['queued', 'processing'],
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

export function isTerminalJobStatus(status: MatchAnalysisJobStatus): boolean {
  return status === 'complete' || status === 'failed';
}

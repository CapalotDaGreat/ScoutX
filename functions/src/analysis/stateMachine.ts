export type JobStatus =
  | 'draft'
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'complete'
  | 'failed';

const ALLOWED: Record<JobStatus, readonly JobStatus[]> = {
  draft: ['uploading', 'failed'],
  uploading: ['queued', 'failed'],
  queued: ['processing', 'failed'],
  processing: ['complete', 'failed', 'queued'],
  complete: [],
  failed: ['queued', 'processing'],
};

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  if (from === to) {
    return true;
  }
  return (ALLOWED[from] ?? []).includes(to);
}

export type AnalysisLease = {
  holder: string;
  until: string;
};

export function leaseExpired(lease: AnalysisLease | undefined, nowMs: number): boolean {
  if (!lease || typeof lease.until !== 'string') {
    return true;
  }
  const until = Date.parse(lease.until);
  return !Number.isFinite(until) || until <= nowMs;
}

export function canAcquireLease(
  lease: AnalysisLease | undefined,
  holder: string,
  nowMs: number,
): boolean {
  if (!lease) {
    return true;
  }
  if (lease.holder === holder) {
    return true;
  }
  return leaseExpired(lease, nowMs);
}

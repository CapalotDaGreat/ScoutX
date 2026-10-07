/** Coarse status the app renders. Derived from the server-only pipeline state. */
export type JobStatus =
  | 'draft'
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'complete'
  | 'failed'
  | 'cancelled'
  | 'expired';

const ALLOWED: Record<JobStatus, readonly JobStatus[]> = {
  draft: ['uploading', 'failed', 'cancelled'],
  uploading: ['queued', 'failed', 'cancelled', 'expired'],
  queued: ['processing', 'failed', 'cancelled'],
  processing: ['complete', 'failed', 'queued', 'cancelled'],
  complete: [],
  failed: ['queued', 'processing'],
  cancelled: [],
  expired: [],
};

/**
 * Server-only pipeline: CREATED → UPLOADING → VALIDATING → QUEUED → EXTRACTING → ANALYZING →
 * COMPLETED, with FAILED (retryable), CANCELLED and EXPIRED as exits. Clients can only create a
 * job and request cancellation.
 */
export const PIPELINE_STATES = [
  'created',
  'uploading',
  'validating',
  'queued',
  'extracting',
  'analyzing',
  'completed',
  'failed',
  'cancelled',
  'expired',
] as const;
export type PipelineState = (typeof PIPELINE_STATES)[number];

const PIPELINE_ALLOWED: Record<PipelineState, readonly PipelineState[]> = {
  created: ['uploading', 'validating', 'queued', 'failed', 'cancelled', 'expired'],
  uploading: ['validating', 'failed', 'cancelled', 'expired'],
  validating: ['queued', 'failed', 'cancelled'],
  queued: ['extracting', 'analyzing', 'failed', 'cancelled'],
  extracting: ['analyzing', 'failed', 'cancelled', 'queued'],
  analyzing: ['completed', 'failed', 'cancelled', 'queued'],
  completed: [],
  failed: ['queued', 'analyzing'],
  cancelled: [],
  expired: [],
};

export const TERMINAL_PIPELINE_STATES: readonly PipelineState[] = ['completed', 'cancelled', 'expired'];

export function parsePipelineState(value: unknown, status?: unknown): PipelineState {
  if (typeof value === 'string' && (PIPELINE_STATES as readonly string[]).includes(value)) return value as PipelineState;
  switch (status) {
    case 'queued': return 'queued';
    case 'processing': return 'analyzing';
    case 'complete': return 'completed';
    case 'failed': return 'failed';
    case 'cancelled': return 'cancelled';
    case 'expired': return 'expired';
    case 'uploading': return 'uploading';
    default: return 'created';
  }
}

export function canTransitionPipeline(from: PipelineState, to: PipelineState): boolean {
  return from === to || PIPELINE_ALLOWED[from].includes(to);
}

export function statusForPipeline(state: PipelineState): JobStatus {
  switch (state) {
    case 'created':
    case 'uploading':
    case 'validating':
      return 'uploading';
    case 'queued':
      return 'queued';
    case 'extracting':
    case 'analyzing':
      return 'processing';
    case 'completed':
      return 'complete';
    default:
      return state;
  }
}

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

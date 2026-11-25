/**
 * In-memory stage machine for an experimental long match. It is not registered as a Cloud
 * Function and the production orchestrator does not call it.
 *
 * A failed resolve leaves a completed extract in place. A repeated delivery of a finished
 * stage does not run the work again. A mismatched generation is rejected as stale.
 */

export type StageName = 'extract' | 'resolve';
export type StageStatus = 'empty' | 'done' | 'failed';
export type StageState = { status: StageStatus; attempts: number; output: string | null };
export type ExperimentalJob = {
  generation: number;
  cancelled: boolean;
  stages: Record<StageName, StageState>;
};
export type Delivery = 'applied' | 'duplicate' | 'stale' | 'cancelled' | 'rejected';

const empty = (): StageState => ({ status: 'empty', attempts: 0, output: null });

export function newExperimentalJob(generation = 1): ExperimentalJob {
  return { generation, cancelled: false, stages: { extract: empty(), resolve: empty() } };
}

function copy(job: ExperimentalJob): ExperimentalJob {
  return {
    generation: job.generation,
    cancelled: job.cancelled,
    stages: {
      extract: { ...job.stages.extract },
      resolve: { ...job.stages.resolve },
    },
  };
}

export function cancelExperimentalJob(job: ExperimentalJob): ExperimentalJob {
  return { ...copy(job), cancelled: true };
}

export function serialiseJob(job: ExperimentalJob): string {
  return JSON.stringify(job);
}

export function restoreJob(raw: string): ExperimentalJob {
  const parsed = JSON.parse(raw) as ExperimentalJob;
  if (!parsed || typeof parsed.generation !== 'number' || !parsed.stages?.extract || !parsed.stages?.resolve) {
    throw new Error('experimental job record is incomplete');
  }
  return copy({ ...parsed, cancelled: parsed.cancelled === true });
}

export function deliverStage(job: ExperimentalJob, generation: number, stage: StageName,
  compute: () => string): { job: ExperimentalJob; delivery: Delivery } {
  if (generation !== job.generation) return { job, delivery: 'stale' };
  if (job.cancelled) return { job, delivery: 'cancelled' };
  const current = job.stages[stage];
  if (current.status === 'done') return { job, delivery: 'duplicate' };
  if (stage === 'resolve' && job.stages.extract.status !== 'done') return { job, delivery: 'rejected' };
  const next = copy(job);
  try {
    next.stages[stage] = { status: 'done', attempts: current.attempts + 1, output: compute() };
  } catch {
    next.stages[stage] = { status: 'failed', attempts: current.attempts + 1, output: null };
  }
  return { job: next, delivery: 'applied' };
}

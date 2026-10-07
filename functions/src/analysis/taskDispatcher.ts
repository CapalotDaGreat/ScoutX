import { getFunctions } from 'firebase-admin/functions';

export type AnalysisTask =
  | { kind: 'extract_segment'; jobId: string; generation: number; segmentIndex: number }
  | { kind: 'analyze_frames'; jobId: string; generation: number };

export const TASK_FUNCTIONS: Record<AnalysisTask['kind'], string> = {
  extract_segment: 'extractMatchSegment',
  analyze_frames: 'analyzeMatchFrames',
};

export interface TaskDispatcher {
  enqueue(task: AnalysisTask, options?: { delaySeconds?: number }): Promise<void>;
}

/** Cloud Tasks queues backing the task functions. */
export const cloudTasksDispatcher: TaskDispatcher = {
  async enqueue(task, options) {
    await getFunctions()
      .taskQueue(TASK_FUNCTIONS[task.kind])
      .enqueue(task, {
        dispatchDeadlineSeconds: 1800,
        ...(options?.delaySeconds ? { scheduleDelaySeconds: options.delaySeconds } : {}),
      });
  },
};

let activeDispatcher: TaskDispatcher = cloudTasksDispatcher;

export function getTaskDispatcher(): TaskDispatcher {
  return activeDispatcher;
}

export function setTaskDispatcher(dispatcher: TaskDispatcher): void {
  activeDispatcher = dispatcher;
}

export function parseAnalysisTask(value: unknown): AnalysisTask | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (typeof data.jobId !== 'string' || !data.jobId || typeof data.generation !== 'number') return null;
  if (data.kind === 'analyze_frames') return { kind: 'analyze_frames', jobId: data.jobId, generation: data.generation };
  if (data.kind === 'extract_segment' && typeof data.segmentIndex === 'number' && data.segmentIndex >= 0) {
    return { kind: 'extract_segment', jobId: data.jobId, generation: data.generation, segmentIndex: data.segmentIndex };
  }
  return null;
}

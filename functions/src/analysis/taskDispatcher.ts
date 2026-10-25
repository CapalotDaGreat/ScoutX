import { getFunctions } from 'firebase-admin/functions';
import { taskQueueName } from '../region';

export type AnalysisTask =
  | { kind: 'extract_segment'; jobId: string; generation: number; segmentIndex: number }
  | { kind: 'analyze_frames'; jobId: string; generation: number }
  | { kind: 'review_segment'; jobId: string; generation: number; segmentIndex: number }
  | { kind: 'synthesize_report'; jobId: string; generation: number };

export const TASK_FUNCTIONS: Record<AnalysisTask['kind'], string> = {
  extract_segment: 'extractMatchSegment',
  analyze_frames: 'analyzeMatchFrames',
  review_segment: 'reviewMatchSegment',
  synthesize_report: 'synthesizeMatchReport',
};

export interface TaskDispatcher {
  enqueue(task: AnalysisTask, options?: { delaySeconds?: number }): Promise<void>;
}

/** Cloud Tasks queues backing the task functions. */
export const cloudTasksDispatcher: TaskDispatcher = {
  async enqueue(task, options) {
    await getFunctions()
      .taskQueue(taskQueueName(TASK_FUNCTIONS[task.kind]))
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
  if (typeof data.jobId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(data.jobId)
    || typeof data.generation !== 'number' || !Number.isSafeInteger(data.generation) || data.generation < 0) return null;
  if (data.kind === 'analyze_frames') return { kind: 'analyze_frames', jobId: data.jobId, generation: data.generation };
  if (data.kind === 'synthesize_report') return { kind: 'synthesize_report', jobId: data.jobId, generation: data.generation };
  const segmentIndex = data.segmentIndex;
  if (typeof segmentIndex !== 'number' || !Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex > 50) return null;
  if (data.kind === 'extract_segment') {
    return { kind: 'extract_segment', jobId: data.jobId, generation: data.generation, segmentIndex };
  }
  if (data.kind === 'review_segment') {
    return { kind: 'review_segment', jobId: data.jobId, generation: data.generation, segmentIndex };
  }
  return null;
}

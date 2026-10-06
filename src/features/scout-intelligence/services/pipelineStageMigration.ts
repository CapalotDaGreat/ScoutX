import type { PipelineStage, StageHistoryEntry } from '@/features/scout-intelligence/types';

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  'discovered',
  'shortlisted',
  'contacted',
  'invited',
  'trial',
  'evaluated',
  'follow_up',
] as const;

const LEGACY_PIPELINE_STAGE_MAP: Record<string, PipelineStage> = {
  observed: 'discovered',
  interested: 'shortlisted',
  watching: 'shortlisted',
  invite_planned: 'invited',
  trial_completed: 'trial',
  offer: 'evaluated',
  rejected: 'follow_up',
  signed: 'evaluated',
};

export function migratePipelineStage(value: unknown): PipelineStage {
  if (typeof value === 'string' && (PIPELINE_STAGES as readonly string[]).includes(value)) {
    return value as PipelineStage;
  }
  if (typeof value === 'string' && LEGACY_PIPELINE_STAGE_MAP[value]) {
    return LEGACY_PIPELINE_STAGE_MAP[value];
  }
  return 'discovered';
}

export function appendStageHistory(
  history: StageHistoryEntry[] | undefined,
  stage: PipelineStage,
  at: string,
): StageHistoryEntry[] {
  const previous = history ?? [];
  const last = previous[previous.length - 1];
  if (last?.stage === stage) {
    return previous;
  }
  return [...previous, { stage, at }];
}

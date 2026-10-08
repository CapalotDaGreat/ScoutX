import { CV_UNAVAILABLE_REASON, isCvWorkerStage } from './workerContract';

/**
 * Stage records shown in the app. Progress is stage-based only (`progress: null`): PitchProof
 * does not invent percentages for work it cannot measure.
 */
export type StageStatus = 'pending' | 'active' | 'complete' | 'failed' | 'unavailable';

export type StageRecord = {
  id: string;
  label: string;
  status: StageStatus;
  note?: string;
  startedAt?: string;
  completedAt?: string;
  attempts?: number;
  retryable?: boolean;
  progress: null;
};

const STAGE_LABELS: Array<[string, string]> = [
  ['video-ingestion', 'Validating video'],
  ['frame-extraction', 'Extracting key frames'],
  ['match-segmentation', 'Finding match segments'],
  ['player-identification', 'Identifying players in sampled frames'],
  ['identity-confirmation', 'Confirm this is you'],
  ['player-tracking', 'Continuous player tracking'],
  ['event-detection', 'Computer-vision event detection'],
  ['tactical-context', 'Tactical phase and pitch mapping'],
  ['role-analysis', 'Role execution from tracking'],
  ['cross-event-reasoning', 'Connecting detected events'],
  ['coaching-synthesis', 'Building coaching feedback'],
  ['validation', 'Validating evidence'],
  ['final-report', 'Finalizing report'],
];

export function initialStages(): StageRecord[] {
  return STAGE_LABELS.map(([id, label]) => {
    if (isCvWorkerStage(id)) return { id, label, status: 'unavailable', note: CV_UNAVAILABLE_REASON, progress: null };
    if (id === 'cross-event-reasoning') {
      return {
        id,
        label,
        status: 'unavailable',
        note: 'No validated event stream exists until event detection is available.',
        progress: null,
      };
    }
    return { id, label, status: 'pending', progress: null };
  });
}

export function parseStages(value: unknown): StageRecord[] {
  if (!Array.isArray(value) || value.length === 0) return initialStages();
  const byId = new Map(
    value
      .filter((item): item is StageRecord => Boolean(item) && typeof (item as StageRecord).id === 'string')
      .map((item) => [item.id, item]),
  );
  return initialStages().map((stage) => {
    const stored = byId.get(stage.id);
    if (!stored || stage.status === 'unavailable') return stage;
    return { ...stage, ...stored, label: stage.label, progress: null };
  });
}

export function updateStage(
  stages: StageRecord[],
  id: string,
  status: StageStatus,
  now: string,
  extra: Partial<Pick<StageRecord, 'note' | 'retryable'>> = {},
): StageRecord[] {
  return stages.map((stage) => {
    if (stage.id !== id || stage.status === 'unavailable') return stage;
    const next: StageRecord = { ...stage, ...extra, status };
    if (status === 'active') {
      next.startedAt = now;
      next.attempts = (stage.attempts ?? 0) + 1;
      delete next.completedAt;
    }
    if (status === 'complete' || status === 'failed') next.completedAt = now;
    return next;
  });
}

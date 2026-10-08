/** Mirrors functions/src/analysis/corrections.ts. */
export const CORRECTION_TARGET_KINDS = ['possible_event', 'event', 'observation', 'identity_frame'] as const;
export type CorrectionTargetKind = (typeof CORRECTION_TARGET_KINDS)[number];
export const CORRECTION_ACTIONS = ['confirm', 'dispute', 'dismiss_false_event', 'is_me', 'not_me', 'withdraw'] as const;
export type CorrectionAction = (typeof CORRECTION_ACTIONS)[number];
export const CORRECTION_REASONS = ['not_me', 'did_not_happen', 'wrong_type', 'wrong_time', 'other'] as const;
export type CorrectionReason = (typeof CORRECTION_REASONS)[number];

export type AnalysisCorrection = {
  id: string;
  targetKind: CorrectionTargetKind;
  targetId: string;
  action: CorrectionAction;
  reason: CorrectionReason | null;
  createdAt: string;
};

export type SubmitCorrectionRequest = {
  jobId: string;
  targetKind: CorrectionTargetKind;
  targetId: string;
  action: CorrectionAction;
  reason?: CorrectionReason | null;
  note?: string | null;
};

const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

export function parseCorrection(id: string, data: unknown): AnalysisCorrection | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (!oneOf(CORRECTION_TARGET_KINDS, record.targetKind) || !oneOf(CORRECTION_ACTIONS, record.action)) return null;
  if (typeof record.targetId !== 'string' || typeof record.createdAt !== 'string') return null;
  return {
    id,
    targetKind: record.targetKind,
    targetId: record.targetId,
    action: record.action,
    reason: oneOf(CORRECTION_REASONS, record.reason) ? record.reason : null,
    createdAt: record.createdAt,
  };
}

export const correctionTargetKey = (kind: CorrectionTargetKind, id: string) => `${kind}:${id}`;

/** Latest standing correction per target; a later `withdraw` clears it. Same rule as the server. */
export function latestCorrections(records: AnalysisCorrection[]): Map<string, AnalysisCorrection> {
  const sorted = [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const latest = new Map<string, AnalysisCorrection>();
  for (const record of sorted) {
    const key = correctionTargetKey(record.targetKind, record.targetId);
    if (record.action === 'withdraw') latest.delete(key);
    else latest.set(key, record);
  }
  return latest;
}

/**
 * Events the player marked as not having happened (or not them). Stored statistics are never
 * recalculated from this; the app only flags that the numbers include disputed events.
 */
export function disputedEventIds(latest: Map<string, AnalysisCorrection>): string[] {
  return [...latest.values()]
    .filter((item) => item.targetKind === 'event' && (item.action === 'dismiss_false_event' || item.action === 'dispute'))
    .map((item) => item.targetId);
}


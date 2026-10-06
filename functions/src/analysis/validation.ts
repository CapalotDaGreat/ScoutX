export type ValidationStatus = 'accepted' | 'rejected' | 'needs_identity';

export type RawObservation = {
  frameId?: unknown;
  timestampSec?: unknown;
  label?: unknown;
  detail?: unknown;
  kind?: unknown;
  type?: unknown;
};

export type NormalizedObservation = {
  frameId: string;
  timestampSec: number;
  label: string;
  detail: string;
  kind: 'observation' | 'inference' | 'unknown';
};

/**
 * Observations must cite a known frame id. Anything else is dropped, not guessed.
 */
export function normalizeObservations(
  raw: unknown,
  knownFrameIds: Set<string>,
  durationSec: number,
): NormalizedObservation[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: NormalizedObservation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as RawObservation;
    const frameId = typeof row.frameId === 'string' ? row.frameId : '';
    if (!knownFrameIds.has(frameId)) {
      continue;
    }
    const timestampSec =
      typeof row.timestampSec === 'number' && Number.isFinite(row.timestampSec)
        ? Math.max(0, Math.round(row.timestampSec))
        : null;
    if (timestampSec === null || (durationSec > 0 && timestampSec > durationSec)) {
      continue;
    }
    const kind =
      row.kind === 'inference' || row.kind === 'unknown' ? row.kind : 'observation';
    out.push({
      frameId,
      timestampSec,
      label: typeof row.label === 'string' ? row.label : 'Observation',
      detail: typeof row.detail === 'string' ? row.detail : '',
      kind,
    });
  }
  return out;
}

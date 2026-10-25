export type TargetBox = { x: number; y: number; width: number; height: number };
export type TargetAnchor = {
  frameId: string;
  timestampSec: number;
  box: TargetBox;
  provenance: 'user_selected';
};
export type ExperimentalTargetIdentity = {
  schemaVersion: 1;
  targetId: string;
  sourcePath: string;
  revision: number;
  anchors: TargetAnchor[];
  updatedAt: string;
  lastOperationId: string;
  lastOperationDigest: string;
};
export type TargetAnchorRequest = {
  jobId: string;
  frameId: string;
  operationId: string;
  operation: 'upsert' | 'remove';
  expectedGeneration: number;
  expectedRevision: number;
  box?: TargetBox;
};
export const MAX_TARGET_ANCHORS = 8;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseTargetBox(value: unknown): TargetBox | null {
  const input = record(value);
  if (!input || Object.keys(input).length !== 4 || !['x', 'y', 'width', 'height'].every((key) =>
    typeof input[key] === 'number' && Number.isFinite(input[key]))) return null;
  const { x, y, width, height } = input as TargetBox;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) return null;
  return { x, y, width, height };
}

export function parseTargetAnchorRequest(value: unknown): TargetAnchorRequest | null {
  const input = record(value);
  if (!input || Object.keys(input).some((key) => ![
    'jobId', 'frameId', 'operationId', 'operation', 'expectedGeneration', 'expectedRevision', 'box',
  ].includes(key))) return null;
  if (typeof input.jobId !== 'string' || !/^[A-Za-z0-9_-]{6,80}$/.test(input.jobId)
    || typeof input.frameId !== 'string' || !/^frame_[0-9]{1,6}$/.test(input.frameId)
    || typeof input.operationId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(input.operationId)
    || (input.operation !== 'upsert' && input.operation !== 'remove')
    || !Number.isSafeInteger(input.expectedGeneration) || Number(input.expectedGeneration) < 0
    || !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0) return null;
  const box = input.operation === 'upsert' ? parseTargetBox(input.box) : undefined;
  if (input.operation === 'upsert' && !box) return null;
  if (input.operation === 'remove' && input.box !== undefined) return null;
  return {
    jobId: input.jobId, frameId: input.frameId, operationId: input.operationId,
    operation: input.operation, expectedGeneration: Number(input.expectedGeneration), expectedRevision: Number(input.expectedRevision),
    ...(box ? { box } : {}),
  };
}

/** Anchor edits identify only the selected observation, never a whole tracker or match. */
export function editTargetAnchors(anchors: readonly TargetAnchor[], request: TargetAnchorRequest, timestampSec: number): TargetAnchor[] {
  const next = anchors.filter((anchor) => anchor.frameId !== request.frameId);
  if (request.operation === 'upsert') {
    const box = parseTargetBox(request.box);
    if (!box || !Number.isFinite(timestampSec) || timestampSec < 0) throw new Error('Invalid target anchor');
    next.push({ frameId: request.frameId, timestampSec, box, provenance: 'user_selected' });
  }
  if (next.length > MAX_TARGET_ANCHORS) throw new Error('Too many target anchors');
  return next.sort((a, b) => a.timestampSec - b.timestampSec || a.frameId.localeCompare(b.frameId));
}

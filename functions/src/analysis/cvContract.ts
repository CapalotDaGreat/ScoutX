/**
 * Contract v2 between Cloud Functions and the GPU computer-vision worker
 * (reference implementation: workers/football-cv). One request covers one 10-minute segment.
 * Every response is validated here; anything malformed is discarded, never patched up.
 */

export const CV_CONTRACT_VERSION = 2;

export const CV_AVAILABILITY_STATES = [
  'CONFIRMED_VISIBLE',
  'LIKELY_ACTIVE_OFF_CAMERA',
  'CONFIRMED_OFF_PITCH',
  'UNKNOWN',
] as const;
export type CvAvailabilityState = (typeof CV_AVAILABILITY_STATES)[number];

export const CV_IDENTITY_STATES = ['CONFIRMED_VISIBLE', 'CANDIDATE', 'UNKNOWN'] as const;
export const CV_STAGE_STATES = ['complete', 'failed', 'unavailable'] as const;
export const CV_EVENT_TYPES = ['shot', 'pass', 'dribble', 'tackle', 'save', 'duel', 'other'] as const;
export const CV_CAMERA_VIEWS = ['wide', 'medium', 'close', 'replay', 'non_play', 'unclear'] as const;

export type CvSegmentRequest = {
  contractVersion: typeof CV_CONTRACT_VERSION;
  jobId: string;
  segmentIndex: number;
  startSec: number;
  endSec: number;
  source: { url: string; headers: string | null };
  target: {
    jerseyNumber: string;
    kitPrimaryColor: string;
    kitSecondaryColor: string;
    teamSide: string;
    position: string;
  };
  sampling: { fps: number };
  privacy: { retainNonTargetIdentities: false; faceRecognition: false; persistMedia: false };
};

export type CvWindow = { startSec: number; endSec: number; state: CvAvailabilityState; confidence: number };
export type CvCandidate = {
  trackId: string;
  jerseyRead: string | null;
  jerseyConfidence: number;
  teamMatch: number;
  firstSec: number;
  lastSec: number;
};
export type CvEvent = {
  type: (typeof CV_EVENT_TYPES)[number];
  startSec: number;
  endSec: number;
  confidence: number;
  frameTimesSec: number[];
};

export type CvSegmentResult = {
  contractVersion: typeof CV_CONTRACT_VERSION;
  workerVersion: string;
  models: Record<string, string>;
  segmentIndex: number;
  stages: { tracking: (typeof CV_STAGE_STATES)[number]; identity: (typeof CV_STAGE_STATES)[number]; events: (typeof CV_STAGE_STATES)[number]; pitch: (typeof CV_STAGE_STATES)[number] };
  cameraView: (typeof CV_CAMERA_VIEWS)[number];
  identity: { state: (typeof CV_IDENTITY_STATES)[number]; candidates: CvCandidate[] };
  availability: CvWindow[];
  coverage: { analysedSec: number; targetVisibleSec: number; framesDecoded: number };
  events: CvEvent[];
};

export const CV_SAMPLE_FPS = 2;

export function buildCvRequest(params: {
  jobId: string;
  segment: { index: number; startSec: number; endSec: number };
  source: { url: string; headers: string | null };
  targeting: Record<string, unknown>;
}): CvSegmentRequest {
  const text = (value: unknown, max = 40) => (typeof value === 'string' ? value.slice(0, max) : '');
  return {
    contractVersion: CV_CONTRACT_VERSION,
    jobId: params.jobId,
    segmentIndex: params.segment.index,
    startSec: params.segment.startSec,
    endSec: params.segment.endSec,
    source: params.source,
    target: {
      jerseyNumber: text(params.targeting.jerseyNumber, 3),
      kitPrimaryColor: text(params.targeting.kitPrimaryColor),
      kitSecondaryColor: text(params.targeting.kitSecondaryColor),
      teamSide: text(params.targeting.teamSide, 10) || 'unknown',
      position: text(params.targeting.position, 12) || 'unknown',
    },
    sampling: { fps: CV_SAMPLE_FPS },
    privacy: { retainNonTargetIdentities: false, faceRecognition: false, persistMedia: false },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function unit(value: unknown): number | null {
  const n = finite(value);
  return n !== null && n >= 0 && n <= 1 ? n : null;
}

function within(value: unknown, start: number, end: number): number | null {
  const n = finite(value);
  return n !== null && n >= start - 0.5 && n <= end + 0.5 ? Math.min(end, Math.max(start, n)) : null;
}

function member<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** Returns null for anything that does not match the contract exactly. */
export function parseCvSegmentResult(
  value: unknown,
  expected: { segmentIndex: number; startSec: number; endSec: number },
): CvSegmentResult | null {
  if (!isObject(value) || value.contractVersion !== CV_CONTRACT_VERSION) return null;
  if (value.segmentIndex !== expected.segmentIndex) return null;
  const workerVersion = typeof value.workerVersion === 'string' ? value.workerVersion.slice(0, 40) : '';
  if (!workerVersion) return null;
  const models: Record<string, string> = {};
  for (const [key, model] of Object.entries(isObject(value.models) ? value.models : {}).slice(0, 8)) {
    if (typeof model === 'string' && key.length <= 40) models[key] = model.slice(0, 120);
  }
  const { startSec, endSec } = expected;

  const rawStages = isObject(value.stages) ? value.stages : {};
  const stages = {
    tracking: member(rawStages.tracking, CV_STAGE_STATES) ?? 'unavailable',
    identity: member(rawStages.identity, CV_STAGE_STATES) ?? 'unavailable',
    events: member(rawStages.events, CV_STAGE_STATES) ?? 'unavailable',
    pitch: member(rawStages.pitch, CV_STAGE_STATES) ?? 'unavailable',
  };

  const rawIdentity = isObject(value.identity) ? value.identity : {};
  const candidates: CvCandidate[] = [];
  for (const item of Array.isArray(rawIdentity.candidates) ? rawIdentity.candidates.slice(0, 10) : []) {
    if (!isObject(item)) continue;
    const firstSec = within(item.firstSec, startSec, endSec);
    const lastSec = within(item.lastSec, startSec, endSec);
    const jerseyConfidence = unit(item.jerseyConfidence);
    const teamMatch = unit(item.teamMatch);
    if (typeof item.trackId !== 'string' || firstSec === null || lastSec === null || lastSec < firstSec) continue;
    if (jerseyConfidence === null || teamMatch === null) continue;
    candidates.push({
      trackId: item.trackId.slice(0, 40),
      jerseyRead: typeof item.jerseyRead === 'string' && /^[0-9]{1,3}$/.test(item.jerseyRead) ? item.jerseyRead : null,
      jerseyConfidence,
      teamMatch,
      firstSec,
      lastSec,
    });
  }

  const availability: CvWindow[] = [];
  for (const item of Array.isArray(value.availability) ? value.availability.slice(0, 200) : []) {
    if (!isObject(item)) continue;
    const start = within(item.startSec, startSec, endSec);
    const end = within(item.endSec, startSec, endSec);
    const state = member(item.state, CV_AVAILABILITY_STATES);
    const confidence = unit(item.confidence);
    if (start === null || end === null || end < start || !state || confidence === null) continue;
    availability.push({ startSec: start, endSec: end, state, confidence });
  }
  availability.sort((a, b) => a.startSec - b.startSec);
  for (let i = 1; i < availability.length; i += 1) {
    if (availability[i].startSec < availability[i - 1].endSec) return null;
  }

  const rawCoverage = isObject(value.coverage) ? value.coverage : {};
  const segmentLength = endSec - startSec;
  const analysedSec = finite(rawCoverage.analysedSec);
  const targetVisibleSec = finite(rawCoverage.targetVisibleSec);
  const framesDecoded = finite(rawCoverage.framesDecoded);
  if (analysedSec === null || targetVisibleSec === null || framesDecoded === null) return null;
  if (analysedSec < 0 || analysedSec > segmentLength + 1 || targetVisibleSec < 0 || targetVisibleSec > analysedSec) return null;

  const events: CvEvent[] = [];
  for (const item of Array.isArray(value.events) ? value.events.slice(0, 100) : []) {
    if (!isObject(item)) continue;
    const type = member(item.type, CV_EVENT_TYPES);
    const start = within(item.startSec, startSec, endSec);
    const end = within(item.endSec, startSec, endSec);
    const confidence = unit(item.confidence);
    if (!type || start === null || end === null || end < start || confidence === null) continue;
    const frameTimesSec = (Array.isArray(item.frameTimesSec) ? item.frameTimesSec : [])
      .map((time) => within(time, startSec, endSec))
      .filter((time): time is number => time !== null)
      .slice(0, 8);
    if (frameTimesSec.length === 0) continue;
    events.push({ type, startSec: start, endSec: end, confidence, frameTimesSec });
  }

  return {
    contractVersion: CV_CONTRACT_VERSION,
    workerVersion,
    models,
    segmentIndex: expected.segmentIndex,
    stages,
    cameraView: member(value.cameraView, CV_CAMERA_VIEWS) ?? 'unclear',
    identity: { state: member(rawIdentity.state, CV_IDENTITY_STATES) ?? 'UNKNOWN', candidates },
    availability,
    coverage: { analysedSec, targetVisibleSec, framesDecoded: Math.round(framesDecoded) },
    events: stages.events === 'complete' ? events : [],
  };
}

/** Lower-case availability windows used by the report; UNKNOWN fills every gap. */
export function reportWindowsFromCv(results: CvSegmentResult[], durationSec: number): Array<{
  id: string; startSec: number; endSec: number; state: string; confidence: number; label: string; note: string;
}> {
  const windows = results
    .flatMap((result) => result.availability)
    .filter((window) => window.state !== 'UNKNOWN')
    .sort((a, b) => a.startSec - b.startSec);
  const out: Array<{ id: string; startSec: number; endSec: number; state: string; confidence: number; label: string; note: string }> = [];
  let cursor = 0;
  const push = (startSec: number, endSec: number, state: string, confidence: number) => {
    out.push({
      id: `avail_${out.length}`,
      startSec,
      endSec,
      state,
      confidence,
      label: state === 'unknown' ? 'Unknown' : state.replace(/_/g, ' '),
      note: state === 'unknown' ? 'The tracker could not place the player here.' : 'From the computer-vision tracker.',
    });
  };
  for (const window of windows) {
    if (window.startSec > cursor) push(cursor, window.startSec, 'unknown', 0);
    push(window.startSec, window.endSec, window.state.toLowerCase(), window.confidence);
    cursor = Math.max(cursor, window.endSec);
  }
  if (durationSec > cursor) push(cursor, durationSec, 'unknown', 0);
  return out;
}

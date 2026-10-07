/** Full matches are processed in 10-minute segments, one Cloud Task each. */
export const SEGMENT_SEC = 600;

export const EXTRACTION = {
  /** Scene-change score that counts as a cut or a big camera move. */
  sceneThreshold: 0.3,
  /** Never pick two frames closer than this. */
  minSpacingSec: 8,
  /** Force a frame after this long without a scene change (static cameras). */
  forcedEverySec: 60,
  capPerSegment: 12,
  width: 640,
  /** Frames sent to the vision model per analysis, spread evenly over the match. */
  maxModelFrames: 18,
} as const;

export type SegmentPlan = { index: number; startSec: number; endSec: number };

export type SegmentState = 'pending' | 'running' | 'complete' | 'failed';

export type SegmentRecord = SegmentPlan & {
  state: SegmentState;
  frameCount: number;
  attempts: number;
  error: string | null;
};

export function planSegments(durationSec: number, segmentSec: number = SEGMENT_SEC): SegmentPlan[] {
  const total = Math.max(0, Math.floor(durationSec));
  const plans: SegmentPlan[] = [];
  for (let start = 0, index = 0; start < total; start += segmentSec, index += 1) {
    plans.push({ index, startSec: start, endSec: Math.min(total, start + segmentSec) });
  }
  return plans;
}

/**
 * ffmpeg select expression: the first frame, then frames that are both at least
 * `minSpacingSec` after the previous pick and either a scene change or `forcedEverySec` later.
 */
export function selectExpression(config: typeof EXTRACTION = EXTRACTION): string {
  const since = 't-prev_selected_t';
  return `isnan(prev_selected_t)+gte(${since},${config.minSpacingSec})*(gt(scene,${config.sceneThreshold})+gte(${since},${config.forcedEverySec}))`;
}

/** Argument array for one segment; no shell is involved. */
export function extractionArgs(params: {
  sourceUrl: string;
  headers: string | null;
  startSec: number;
  durationSec: number;
  outputPattern: string;
  config?: typeof EXTRACTION;
}): string[] {
  const config = params.config ?? EXTRACTION;
  return [
    '-hide_banner',
    '-loglevel', 'info',
    '-protocol_whitelist', 'http,https,tcp,tls',
    ...(params.headers ? ['-headers', params.headers] : []),
    '-ss', String(params.startSec),
    '-t', String(params.durationSec),
    '-i', params.sourceUrl,
    '-an',
    '-vf', `select='${selectExpression(config)}',showinfo,scale=${config.width}:-2`,
    '-vsync', 'vfr',
    '-frames:v', String(config.capPerSegment),
    '-q:v', '5',
    params.outputPattern,
  ];
}

/** Timestamps (seconds from segment start) of selected frames, from showinfo output. */
export function parseShowinfoTimes(stderr: string): number[] {
  const times: number[] = [];
  for (const line of stderr.split('\n')) {
    if (!line.includes('Parsed_showinfo')) continue;
    const match = /pts_time:\s*([0-9.]+)/.exec(line);
    if (match) times.push(Number(match[1]));
  }
  return times;
}

export function frameIndexFor(segmentIndex: number, position: number): number {
  return segmentIndex * 100 + position;
}

/** Evenly spaced subset by time, keeping the first and last frame. */
export function pickFramesForModel<T extends { timestampSec: number }>(frames: T[], max: number = EXTRACTION.maxModelFrames): T[] {
  const sorted = [...frames].sort((a, b) => a.timestampSec - b.timestampSec);
  if (sorted.length <= max) return sorted;
  if (max <= 1) return sorted.slice(0, max);
  const picked = new Set<number>();
  for (let i = 0; i < max; i += 1) picked.add(Math.round((i * (sorted.length - 1)) / (max - 1)));
  return [...picked].sort((a, b) => a - b).map((index) => sorted[index]);
}

export function segmentsSettled(segments: SegmentRecord[]): boolean {
  return segments.length > 0 && segments.every((segment) => segment.state === 'complete' || segment.state === 'failed');
}

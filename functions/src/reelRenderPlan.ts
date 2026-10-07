export const REEL_MAX_SEC = 90;
export const REEL_MAX_SEGMENTS = 20;
export const RENDER_DEADLINE_MS = 480_000;

export type ReelAspect = '9:16' | '16:9' | '1:1';

export type ReelExportErrorCode =
  | 'no_segments'
  | 'too_long'
  | 'missing_source'
  | 'invalid_clip'
  | 'unsupported_codec'
  | 'timeout'
  | 'render_failed';

export type RenderSegmentInput = { mediaId: string; inSec: number; outSec: number; caption?: string };

export type RenderSource = { storagePath: string; durationSec: number };

export type PlannedSegment = {
  index: number;
  mediaId: string;
  storagePath: string;
  startSec: number;
  durationSec: number;
  caption: string;
};

export type RenderPlan = {
  width: number;
  height: number;
  segments: PlannedSegment[];
  totalSec: number;
  coverIndex: number;
  srt: string | null;
};

export type RenderPlanResult =
  | { ok: true; plan: RenderPlan }
  | { ok: false; code: ReelExportErrorCode; segmentIndex?: number };

/** Output frame size; the short side is capped at 1080 px. */
export function outputSize(aspect: ReelAspect): { width: number; height: number } {
  if (aspect === '16:9') return { width: 1920, height: 1080 };
  if (aspect === '1:1') return { width: 1080, height: 1080 };
  return { width: 1080, height: 1920 };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function srtTime(totalSec: number): string {
  const ms = Math.round(totalSec * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(rest, 3)}`;
}

/** Captions become a soft subtitle track, so no font files are needed on the server. */
export function buildSrt(segments: readonly PlannedSegment[]): string | null {
  let cursor = 0;
  const cues: string[] = [];
  for (const segment of segments) {
    const text = segment.caption.replace(/\s+/g, ' ').trim();
    if (text) {
      cues.push(`${cues.length + 1}\n${srtTime(cursor)} --> ${srtTime(cursor + segment.durationSec)}\n${text}\n`);
    }
    cursor += segment.durationSec;
  }
  return cues.length > 0 ? cues.join('\n') : null;
}

/**
 * Validates a reel against its media sources before any download or encode. A clip outside
 * its source duration is invalid; a source duration of 0 means unknown and is not checked.
 */
export function buildRenderPlan(
  reel: { segments: readonly RenderSegmentInput[]; aspectRatio: ReelAspect; coverMediaId: string | null },
  sources: ReadonlyMap<string, RenderSource | null>,
): RenderPlanResult {
  if (reel.segments.length === 0) return { ok: false, code: 'no_segments' };
  if (reel.segments.length > REEL_MAX_SEGMENTS) return { ok: false, code: 'too_long' };

  const segments: PlannedSegment[] = [];
  let totalSec = 0;
  for (const [index, segment] of reel.segments.entries()) {
    const source = sources.get(segment.mediaId) ?? null;
    if (!source) return { ok: false, code: 'missing_source', segmentIndex: index };
    const valid =
      Number.isFinite(segment.inSec) &&
      Number.isFinite(segment.outSec) &&
      segment.inSec >= 0 &&
      segment.outSec > segment.inSec &&
      (source.durationSec <= 0 || segment.outSec <= source.durationSec + 0.5);
    if (!valid) return { ok: false, code: 'invalid_clip', segmentIndex: index };
    const durationSec = round3(segment.outSec - segment.inSec);
    totalSec += durationSec;
    segments.push({
      index,
      mediaId: segment.mediaId,
      storagePath: source.storagePath,
      startSec: round3(segment.inSec),
      durationSec,
      caption: (segment.caption ?? '').slice(0, 120),
    });
  }
  if (totalSec > REEL_MAX_SEC + 0.5) return { ok: false, code: 'too_long' };

  const coverIndex = Math.max(0, segments.findIndex((segment) => segment.mediaId === reel.coverMediaId));
  return {
    ok: true,
    plan: { ...outputSize(reel.aspectRatio), segments, totalSec: round3(totalSec), coverIndex, srt: buildSrt(segments) },
  };
}

/** One normalised segment: same size, frame rate and codecs so the concat demuxer can copy. */
export function segmentArgs(
  input: string,
  output: string,
  segment: Pick<PlannedSegment, 'startSec' | 'durationSec'>,
  size: { width: number; height: number },
  withAudio: boolean,
): string[] {
  const video = `scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease,pad=${size.width}:${size.height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p`;
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(segment.startSec), '-t', String(segment.durationSec), '-i', input];
  if (withAudio) {
    args.push('-map', '0:v:0', '-map', '0:a:0');
  } else {
    args.push('-f', 'lavfi', '-t', String(segment.durationSec), '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v:0', '-map', '1:a:0');
  }
  args.push(
    '-vf', video,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
    '-shortest', '-movflags', '+faststart',
    output,
  );
  return args;
}

export function concatArgs(listFile: string, srtFile: string | null, output: string): string[] {
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile];
  if (srtFile) args.push('-i', srtFile, '-map', '0:v', '-map', '0:a', '-map', '1:s', '-c:s', 'mov_text');
  args.push('-c:v', 'copy', '-c:a', 'copy', '-movflags', '+faststart', output);
  return args;
}

export function coverArgs(input: string, atSec: number, output: string): string[] {
  return ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(atSec), '-i', input, '-frames:v', '1', '-q:v', '3', output];
}

export function isMissingAudio(stderr: string): boolean {
  return /matches no streams/i.test(stderr);
}

export function classifyFfmpegError(stderr: string): ReelExportErrorCode {
  if (/Invalid data found|moov atom not found|could not find codec|Decoder \S+ not found|Unknown decoder|unsupported codec/i.test(stderr)) {
    return 'unsupported_codec';
  }
  if (/No such file or directory/i.test(stderr)) return 'missing_source';
  return 'render_failed';
}

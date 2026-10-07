import { UPLOAD_LIMITS } from './model';

/** Server-side media limits checked against ffprobe output, not client claims. */
export const MEDIA_LIMITS = {
  minDurationSec: 1,
  maxDurationSec: UPLOAD_LIMITS.maxDurationSec,
  minShortSide: 90,
  maxLongSide: 7680,
  maxShortSide: 4320,
  minFps: 1,
  maxFps: 240,
  maxBitRate: 200_000_000,
  maxStreams: 8,
  maxVideoStreams: 2,
  videoCodecs: ['h264', 'hevc'],
  audioCodecs: ['aac', 'alac', 'mp3', 'ac3', 'eac3', 'opus', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le'],
} as const;

export type RejectionReason =
  | 'not_video'
  | 'unsupported_container'
  | 'unsupported_codec'
  | 'no_video_stream'
  | 'too_many_streams'
  | 'too_short'
  | 'too_long'
  | 'resolution'
  | 'frame_rate'
  | 'bitrate'
  | 'size_mismatch'
  | 'probe_failed'
  | 'scanner_flagged'
  | 'job_missing';

export type ProbeSummary = {
  container: 'mp4' | 'mov';
  videoCodec: string;
  audioCodec: string | null;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  bitRate: number | null;
  sizeBytes: number;
  streamCount: number;
};

export type ProbeEvaluation = { ok: true; summary: ProbeSummary } | { ok: false; reason: RejectionReason };

type ProbeStream = Record<string, unknown>;
type ProbeOutput = { streams?: ProbeStream[]; format?: Record<string, unknown> };

/** ISO BMFF / QuickTime atoms that can open an MP4 or MOV file (bytes 4–7). */
const LEADING_ATOMS = ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip', 'pnot'];

export function hasVideoMagicBytes(head: Uint8Array): boolean {
  if (head.length < 8) return false;
  const atom = String.fromCharCode(head[4], head[5], head[6], head[7]);
  return LEADING_ATOMS.includes(atom);
}

const num = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** Parses ffprobe rates like "30000/1001". */
export function parseFrameRate(value: unknown): number | null {
  if (typeof value !== 'string') return num(value);
  const [n, d] = value.split('/').map(Number);
  if (!Number.isFinite(n)) return null;
  if (d === undefined) return n;
  return Number.isFinite(d) && d > 0 ? n / d : null;
}

export function parseProbeJson(raw: string): ProbeOutput | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ProbeOutput) : null;
  } catch {
    return null;
  }
}

function majorBrand(format: Record<string, unknown>): string {
  const tags = format.tags as { major_brand?: unknown } | undefined;
  return typeof tags?.major_brand === 'string' ? tags.major_brand.trim() : '';
}

export function evaluateProbe(probe: ProbeOutput | null, expectedSizeBytes: number): ProbeEvaluation {
  if (!probe?.format || !Array.isArray(probe.streams)) return { ok: false, reason: 'probe_failed' };
  const formatName = typeof probe.format.format_name === 'string' ? probe.format.format_name : '';
  if (!formatName.split(',').some((name) => name === 'mov' || name === 'mp4')) {
    return { ok: false, reason: 'unsupported_container' };
  }

  const streams = probe.streams;
  if (streams.length > MEDIA_LIMITS.maxStreams) return { ok: false, reason: 'too_many_streams' };
  const videos = streams.filter(
    (stream) =>
      stream.codec_type === 'video'
      && (stream.disposition as { attached_pic?: number } | undefined)?.attached_pic !== 1,
  );
  if (videos.length === 0) return { ok: false, reason: 'no_video_stream' };
  if (videos.length > MEDIA_LIMITS.maxVideoStreams) return { ok: false, reason: 'too_many_streams' };
  const video = videos[0];
  const videoCodec = String(video.codec_name ?? '');
  if (!(MEDIA_LIMITS.videoCodecs as readonly string[]).includes(videoCodec)) {
    return { ok: false, reason: 'unsupported_codec' };
  }
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  const audioCodec = audio ? String(audio.codec_name ?? '') : null;
  if (audioCodec !== null && !(MEDIA_LIMITS.audioCodecs as readonly string[]).includes(audioCodec)) {
    return { ok: false, reason: 'unsupported_codec' };
  }

  const durationSec = num(probe.format.duration) ?? num(video.duration);
  if (durationSec === null || durationSec < MEDIA_LIMITS.minDurationSec) return { ok: false, reason: 'too_short' };
  if (durationSec > MEDIA_LIMITS.maxDurationSec) return { ok: false, reason: 'too_long' };

  const width = num(video.width) ?? 0;
  const height = num(video.height) ?? 0;
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  if (shortSide < MEDIA_LIMITS.minShortSide || longSide > MEDIA_LIMITS.maxLongSide || shortSide > MEDIA_LIMITS.maxShortSide) {
    return { ok: false, reason: 'resolution' };
  }

  const fps = parseFrameRate(video.avg_frame_rate) ?? parseFrameRate(video.r_frame_rate);
  if (fps === null || fps < MEDIA_LIMITS.minFps || fps > MEDIA_LIMITS.maxFps) return { ok: false, reason: 'frame_rate' };

  const bitRate = num(probe.format.bit_rate);
  if (bitRate !== null && bitRate > MEDIA_LIMITS.maxBitRate) return { ok: false, reason: 'bitrate' };

  const sizeBytes = num(probe.format.size);
  if (sizeBytes !== null && sizeBytes !== expectedSizeBytes) return { ok: false, reason: 'size_mismatch' };

  return {
    ok: true,
    summary: {
      container: majorBrand(probe.format) === 'qt' ? 'mov' : 'mp4',
      videoCodec,
      audioCodec,
      width,
      height,
      fps: Math.round(fps * 100) / 100,
      durationSec: Math.round(durationSec * 10) / 10,
      bitRate,
      sizeBytes: sizeBytes ?? expectedSizeBytes,
      streamCount: streams.length,
    },
  };
}

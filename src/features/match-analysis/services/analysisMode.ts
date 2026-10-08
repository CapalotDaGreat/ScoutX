/**
 * Analysis modes, shared verbatim by the app and Cloud Functions
 * (functions/src/analysis/mode.ts is a copy). The server re-derives the mode from the
 * duration it measured, so a client cannot push a 90-minute match through the clip path.
 */

export const ANALYSIS_MODES = ['SHORT_CLIP', 'MATCH_CLIP', 'FULL_MATCH', 'TRAINING_CLIP'] as const;
export type AnalysisMode = (typeof ANALYSIS_MODES)[number];

export const ANALYSIS_INTENTS = ['match', 'training'] as const;
export type AnalysisIntent = (typeof ANALYSIS_INTENTS)[number];

/** Optional "what happened" hint for short clips. `auto` lets the model classify. */
export const CLIP_CONTEXTS = ['auto', 'shot', 'save', 'pass', 'dribble', 'tackle', 'defensive', 'other'] as const;
export type ClipContext = (typeof CLIP_CONTEXTS)[number];

/**
 * device_frames: the phone samples still frames and only those are uploaded; the video never
 * leaves the device. cloud_video: the video is uploaded for server-side extraction.
 */
export const PROCESSING_MODES = ['device_frames', 'cloud_video'] as const;
export type ProcessingMode = (typeof PROCESSING_MODES)[number];

export const MODE_LIMITS = {
  shortClipMaxSec: 60,
  matchClipMaxSec: 20 * 60,
  maxDurationSec: 150 * 60,
} as const;

/** Dense sampling for short clips: about two frames per second, 8 to 32 frames. */
export const SHORT_CLIP_SAMPLING = { perSecond: 2, minFrames: 8, maxFrames: 32 } as const;

export const PIPELINE_VERSION = '2026.10.2';

export function isAnalysisMode(value: unknown): value is AnalysisMode {
  return typeof value === 'string' && (ANALYSIS_MODES as readonly string[]).includes(value);
}

export function isClipContext(value: unknown): value is ClipContext {
  return typeof value === 'string' && (CLIP_CONTEXTS as readonly string[]).includes(value);
}

export function parseIntent(value: unknown): AnalysisIntent {
  return value === 'training' ? 'training' : 'match';
}

export function selectAnalysisMode(durationSec: number, intent: AnalysisIntent = 'match'): AnalysisMode | null {
  if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > MODE_LIMITS.maxDurationSec) return null;
  if (intent === 'training' && durationSec <= MODE_LIMITS.matchClipMaxSec) return 'TRAINING_CLIP';
  if (durationSec <= MODE_LIMITS.shortClipMaxSec) return 'SHORT_CLIP';
  if (durationSec <= MODE_LIMITS.matchClipMaxSec) return 'MATCH_CLIP';
  return 'FULL_MATCH';
}

export function processingModeFor(mode: AnalysisMode, durationSec: number): ProcessingMode {
  if (mode === 'SHORT_CLIP') return 'device_frames';
  if (mode === 'TRAINING_CLIP' && durationSec <= MODE_LIMITS.shortClipMaxSec) return 'device_frames';
  return 'cloud_video';
}

/** Evenly spaced sample times (seconds) covering the whole clip, first and last frame included. */
export function shortClipSampleTimes(durationSec: number): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  const count = Math.max(
    SHORT_CLIP_SAMPLING.minFrames,
    Math.min(SHORT_CLIP_SAMPLING.maxFrames, Math.round(durationSec * SHORT_CLIP_SAMPLING.perSecond)),
  );
  const end = Math.max(0, durationSec - 0.1);
  const times: number[] = [];
  for (let index = 0; index < count; index += 1) {
    times.push(Math.round(((end * index) / (count - 1)) * 10) / 10);
  }
  return [...new Set(times)];
}

import { MODE_LIMITS } from '@/features/match-analysis/services/analysisMode';

/** Same hard limits the server enforces (functions/src/uploads/probe.ts and model.ts). */
const MIN_DURATION_SEC = 1;
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024 * 1024;

/**
 * Advisory heuristics, not validated accuracy thresholds. They only produce warnings; nothing
 * here can stop an analysis. See docs/video/acceptance-thresholds.md ("Preflight hints").
 */
export const PREFLIGHT_HINTS = {
  /** Shirt numbers on a wide match shot are a few dozen pixels tall below ~720p. */
  minShortSidePx: 720,
  /** Below ~24 fps fast actions (passes, shots) fall between frames. */
  minFrameRate: 24,
  /** Bits per pixel per frame under ~0.04 usually shows heavy compression smearing. */
  minBitsPerPixelFrame: 0.04,
  largeFileBytes: 1.5 * 1024 * 1024 * 1024,
} as const;

/** Facts read from the container/track metadata on the phone; null when the OS did not report it. */
export type FootageFacts = {
  durationSec: number;
  fileSizeBytes: number | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  /** Track bitrate when reported, otherwise the file average (size × 8 / duration). */
  bitrate: number | null;
  bitrateSource: 'track' | 'file_average' | null;
  trackSupported: boolean | null;
};

export type PreflightBlocker = 'too_short' | 'too_long' | 'too_large';
export type PreflightWarning =
  | 'low_resolution'
  | 'low_frame_rate'
  | 'low_bitrate'
  | 'portrait'
  | 'track_unsupported'
  | 'metadata_unavailable'
  | 'large_file';
/** Properties this preflight cannot measure without decoding frames on the phone. */
export type PreflightNotChecked = 'sharpness' | 'lighting' | 'camera_angle' | 'player_visibility';

export type AnalysisPreview = {
  facts: FootageFacts;
  /** Only the limits the server would also refuse; quality never blocks. */
  blockers: PreflightBlocker[];
  /** Observed properties that may make parts of the analysis less reliable. */
  warnings: PreflightWarning[];
  notChecked: PreflightNotChecked[];
  canProceed: boolean;
};

export type AnalysisPreviewInput = {
  durationSec: number;
  fileSizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  frameRate?: number | null;
  trackBitrate?: number | null;
  trackSupported?: boolean | null;
};

const positive = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

export function footageFacts(input: AnalysisPreviewInput): FootageFacts {
  const durationSec = positive(input.durationSec) ?? 0;
  const fileSizeBytes = positive(input.fileSizeBytes);
  const trackBitrate = positive(input.trackBitrate);
  const averageBitrate = fileSizeBytes && durationSec > 0 ? (fileSizeBytes * 8) / durationSec : null;
  return {
    durationSec,
    fileSizeBytes,
    width: positive(input.width),
    height: positive(input.height),
    frameRate: positive(input.frameRate),
    bitrate: trackBitrate ?? averageBitrate,
    bitrateSource: trackBitrate ? 'track' : averageBitrate ? 'file_average' : null,
    trackSupported: typeof input.trackSupported === 'boolean' ? input.trackSupported : null,
  };
}

/**
 * Metadata-only preflight before upload: reads no pixels and never rejects for quality.
 */
export function buildAnalysisPreview(input: AnalysisPreviewInput): AnalysisPreview {
  const facts = footageFacts(input);
  const blockers: PreflightBlocker[] = [];
  const warnings: PreflightWarning[] = [];

  if (facts.durationSec < MIN_DURATION_SEC) blockers.push('too_short');
  if (facts.durationSec > MODE_LIMITS.maxDurationSec) blockers.push('too_long');
  if (facts.fileSizeBytes !== null && facts.fileSizeBytes > MAX_FILE_SIZE_BYTES) blockers.push('too_large');

  if (facts.width === null || facts.height === null) {
    warnings.push('metadata_unavailable');
  } else {
    if (Math.min(facts.width, facts.height) < PREFLIGHT_HINTS.minShortSidePx) warnings.push('low_resolution');
    if (facts.height > facts.width) warnings.push('portrait');
  }
  if (facts.frameRate !== null && facts.frameRate < PREFLIGHT_HINTS.minFrameRate) warnings.push('low_frame_rate');
  if (facts.bitrate !== null && facts.width !== null && facts.height !== null && facts.frameRate !== null) {
    const bitsPerPixelFrame = facts.bitrate / (facts.width * facts.height * facts.frameRate);
    if (bitsPerPixelFrame < PREFLIGHT_HINTS.minBitsPerPixelFrame) warnings.push('low_bitrate');
  }
  if (facts.trackSupported === false) warnings.push('track_unsupported');
  if (facts.fileSizeBytes !== null && facts.fileSizeBytes > PREFLIGHT_HINTS.largeFileBytes) warnings.push('large_file');

  return {
    facts,
    blockers,
    warnings,
    notChecked: ['sharpness', 'lighting', 'camera_angle', 'player_visibility'],
    canProceed: blockers.length === 0,
  };
}

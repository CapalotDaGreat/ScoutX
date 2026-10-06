import type { AnalysisConfidenceBand, AnalysisPreprocessing } from '@/features/match-analysis/types';

const MAX_DURATION_SEC = 150 * 60;
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024 * 1024;
const WARN_FILE_SIZE_BYTES = 1.5 * 1024 * 1024 * 1024;
const SAMPLE_FRAME_COUNT = 18;

export type AnalysisPreviewInput = {
  durationSec: number;
  fileSizeBytes?: number;
  width?: number;
  height?: number;
};

export type AnalysisPreview = {
  preprocessing: AnalysisPreprocessing;
  quality: AnalysisConfidenceBand;
  canProceed: boolean;
  blockers: string[];
};

/**
 * On-device quality check before upload. Uses only metadata we can actually read.
 */
export function buildAnalysisPreview(input: AnalysisPreviewInput): AnalysisPreview {
  const warnings: string[] = [];
  const blockers: string[] = [];
  const durationSec = Number.isFinite(input.durationSec) ? Math.max(0, input.durationSec) : 0;
  const fileSizeBytes = typeof input.fileSizeBytes === 'number' ? input.fileSizeBytes : null;

  if (durationSec < 30) {
    blockers.push('Video is shorter than 30 seconds, so there is not enough match footage to sample.');
  }
  if (durationSec > MAX_DURATION_SEC) {
    blockers.push('Video is longer than the 150-minute analysis limit.');
  }
  if (fileSizeBytes !== null && fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    blockers.push('File is larger than the upload limit.');
  }
  if (fileSizeBytes !== null && fileSizeBytes > WARN_FILE_SIZE_BYTES) {
    warnings.push('Large file: upload may take a while and still uses sampled frames, not full tracking.');
  }
  if (durationSec > 0 && durationSec < 10 * 60) {
    warnings.push('Short clip: only the visible interval can be reviewed. Missing periods stay unknown.');
  }
  if (typeof input.width === 'number' && typeof input.height === 'number' && input.width * input.height < 480 * 360) {
    warnings.push('Low resolution: jersey numbers may be unreadable.');
  }

  let quality: AnalysisConfidenceBand = 'Limited';
  if (blockers.length > 0) {
    quality = 'Insufficient';
  } else if (durationSec >= 45 * 60 && (fileSizeBytes === null || fileSizeBytes < WARN_FILE_SIZE_BYTES)) {
    quality = 'Good';
  } else if (durationSec < 8 * 60) {
    quality = 'Insufficient';
  }

  const sampledFrameCount = durationSec <= 0
    ? 0
    : Math.min(SAMPLE_FRAME_COUNT, Math.max(6, Math.round(durationSec / 60)));

  return {
    preprocessing: {
      durationSec,
      fileSizeBytes,
      sampledFrameCount,
      warnings,
    },
    quality,
    canProceed: blockers.length === 0,
    blockers,
  };
}

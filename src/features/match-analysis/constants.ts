export const MATCH_ANALYSIS_LIMITS = {
  /** Up to ~150 minute amateur matches */
  maxDurationSec: 150 * 60,
  maxFileSizeBytes: 4 * 1024 * 1024 * 1024,
  warnFileSizeBytes: 1.5 * 1024 * 1024 * 1024,
  /** Evenly spaced frames sent to vision model */
  sampleFrameCount: 18,
  frameThumbnailQuality: 0.72,
  frameMaxWidth: 720,
} as const;

export const MATCH_ANALYSIS_STORAGE_PATHS = {
  video: (userId: string, jobId: string) =>
    `profiles/${userId}/matchFootage/${jobId}/video.mp4`,
  frame: (userId: string, jobId: string, index: number) =>
    `profiles/${userId}/matchFootage/${jobId}/frames/frame_${String(index).padStart(3, '0')}.jpg`,
} as const;

export const MATCH_ANALYSIS_COLLECTION = 'matchAnalysisJobs';

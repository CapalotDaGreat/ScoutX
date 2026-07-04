import { type HighlightVideo, type VideoAnalysisMetadata } from '@/features/highlight-videos/types';

/**
 * Placeholder for future AI video analysis integration.
 * Callers can enqueue analysis without coupling to a specific provider.
 */
export type VideoAnalysisJobRequest = {
  videoId: string;
  videoUrl: string;
  category: HighlightVideo['category'];
  tags: string[];
};

export function createQueuedAnalysisMetadata(
  jobId: string,
  modelVersion = 'scoutx-analysis-v0',
): VideoAnalysisMetadata {
  return {
    status: 'queued',
    requestedAt: new Date().toISOString(),
    jobId,
    modelVersion,
  };
}

export async function queueVideoAnalysis(
  request: VideoAnalysisJobRequest,
): Promise<VideoAnalysisMetadata> {
  // Future: dispatch to Cloud Function / external ML pipeline.
  const jobId = `analysis-${request.videoId}-${Date.now()}`;
  return createQueuedAnalysisMetadata(jobId);
}

export type VideoCategory =
  | 'goals'
  | 'assists'
  | 'skills'
  | 'defending'
  | 'goalkeeping'
  | 'passing'
  | 'headers';

export type VideoUploadStatus =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'failed';

export type VideoAnalysisStatus =
  | 'none'
  | 'queued'
  | 'processing'
  | 'complete'
  | 'failed';

/** Reserved for future AI video analysis pipelines. */
export type VideoAnalysisMetadata = {
  status: VideoAnalysisStatus;
  requestedAt?: string;
  completedAt?: string;
  modelVersion?: string;
  jobId?: string;
  insights?: Record<string, string | number | boolean>;
};

export type HighlightVideo = {
  id: string;
  title: string;
  description?: string;
  tags: string[];
  category: VideoCategory;
  match?: string;
  opponent?: string;
  competition?: string;
  date: string;
  durationSec: number;
  videoUrl: string;
  thumbnailUrl: string;
  storagePath: string;
  thumbnailStoragePath?: string;
  featured: boolean;
  sortOrder: number;
  fileSizeBytes?: number;
  uploadStatus: VideoUploadStatus;
  uploadError?: string;
  analysis: VideoAnalysisMetadata;
  createdAt: string;
  updatedAt: string;
};

export type HighlightVideoLibrary = {
  videos: HighlightVideo[];
  featuredVideoId?: string;
  updatedAt: string;
};

export type VideoUploadProgress = {
  videoId: string;
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  phase: 'thumbnail' | 'video' | 'metadata';
};

export type PickedVideoAsset = {
  uri: string;
  durationSec: number;
  fileSizeBytes?: number;
  fileName?: string;
};

export type CompressedVideoResult = {
  uri: string;
  fileSizeBytes: number;
  durationSec: number;
  compressionApplied: boolean;
};

export const emptyHighlightVideoLibrary = (): HighlightVideoLibrary => ({
  videos: [],
  updatedAt: new Date().toISOString(),
});

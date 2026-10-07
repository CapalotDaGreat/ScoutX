export {
  HighlightVideosSection,
  type HighlightVideosSectionProps,
} from '@/features/highlight-videos/components/HighlightVideosSection';
export {
  HighlightVideoGrid,
  type HighlightVideoGridProps,
} from '@/features/highlight-videos/components/HighlightVideoGrid';
export {
  HighlightVideoCard,
  type HighlightVideoCardProps,
} from '@/features/highlight-videos/components/HighlightVideoCard';
export {
  HighlightVideoFeatured,
  type HighlightVideoFeaturedProps,
} from '@/features/highlight-videos/components/HighlightVideoFeatured';
export {
  HighlightVideoCategoryFilter,
  type HighlightVideoCategoryFilterProps,
} from '@/features/highlight-videos/components/HighlightVideoCategoryFilter';
export {
  HighlightVideoPlayerModal,
  type HighlightVideoPlayerModalProps,
} from '@/features/highlight-videos/components/HighlightVideoPlayerModal';
export {
  HighlightVideoEditorModal,
  type HighlightVideoEditorModalProps,
} from '@/features/highlight-videos/components/HighlightVideoEditorModal';
export {
  HighlightVideosManagerModal,
  type HighlightVideosManagerModalProps,
} from '@/features/highlight-videos/components/HighlightVideosManagerModal';
export {
  HighlightVideoUploadProgress,
  type HighlightVideoUploadProgressProps,
} from '@/features/highlight-videos/components/HighlightVideoUploadProgress';

export { useHighlightVideos } from '@/features/highlight-videos/hooks/useHighlightVideos';

export { HighlightVideoRepository } from '@/features/highlight-videos/repositories/HighlightVideoRepository';

export {
  parseHighlightVideo,
  parseHighlightVideoLibrary,
  serializeHighlightVideo,
  serializeHighlightVideoLibrary,
  sortHighlightVideos,
  reorderHighlightVideos,
  setFeaturedHighlightVideo,
  getFeaturedHighlightVideo,
  filterVideosByCategory,
  formatVideoDuration,
  createHighlightVideoId,
  createEmptyHighlightVideo,
} from '@/features/highlight-videos/models/HighlightVideoModel';

export { HighlightReelStudioModal } from '@/features/highlight-reel-studio';
export { pickHighlightVideo } from '@/features/highlight-videos/services/videoPickerService';
export {
  launchVideoFromLibrary,
  photosExportErrorMessage,
} from '@/features/highlight-videos/services/launchVideoFromLibrary';
export {
  requestVideoLibraryPermission,
  ensureVideoLibraryPermission,
  waitForModalDismiss,
} from '@/features/highlight-videos/services/videoLibraryPermission';
export {
  compressHighlightVideo,
  formatFileSize,
  VideoCompressionError,
} from '@/features/highlight-videos/services/videoCompressionService';
export { generateVideoThumbnail } from '@/features/highlight-videos/services/videoThumbnailService';
export {
  queueVideoAnalysis,
  createQueuedAnalysisMetadata,
  type VideoAnalysisJobRequest,
} from '@/features/highlight-videos/services/videoAnalysisService';
export {
  uploadVideoBlob,
  uploadThumbnailBlob,
  deleteVideoStorageFiles,
} from '@/features/highlight-videos/services/highlightVideoStorageService';

export {
  VIDEO_CATEGORY_META,
  VIDEO_CATEGORIES,
  VIDEO_FILTER_ALL,
  VIDEO_STORAGE_LIMITS,
  VIDEO_STORAGE_PATHS,
  DEFAULT_VIDEO_ANALYSIS,
  type VideoCategoryMeta,
  type VideoCategoryFilter,
} from '@/features/highlight-videos/constants';

export {
  type VideoCategory,
  type VideoUploadStatus,
  type VideoAnalysisStatus,
  type VideoAnalysisMetadata,
  type HighlightVideo,
  type HighlightVideoLibrary,
  type VideoUploadProgress,
  type PickedVideoAsset,
  type CompressedVideoResult,
  emptyHighlightVideoLibrary,
} from '@/features/highlight-videos/types';

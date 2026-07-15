import {
  DEFAULT_VIDEO_ANALYSIS,
  VIDEO_STORAGE_PATHS,
} from '@/features/highlight-videos/constants';
import {
  type HighlightVideo,
  type HighlightVideoLibrary,
  type VideoAnalysisMetadata,
  type VideoCategory,
  type VideoUploadStatus,
} from '@/features/highlight-videos/types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const validCategories: VideoCategory[] = [
  'goals',
  'assists',
  'skills',
  'defending',
  'goalkeeping',
  'passing',
  'headers',
];

const validUploadStatuses: VideoUploadStatus[] = [
  'pending',
  'uploading',
  'processing',
  'ready',
  'failed',
];

function parseTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((tag): tag is string => typeof tag === 'string');
}

function parseAnalysis(value: unknown): VideoAnalysisMetadata {
  const record = asRecord(value);
  if (!record) {
    return { ...DEFAULT_VIDEO_ANALYSIS };
  }

  const status =
    record.status === 'queued' ||
    record.status === 'processing' ||
    record.status === 'complete' ||
    record.status === 'failed'
      ? record.status
      : 'none';

  const insightsRecord = asRecord(record.insights);
  const insights: Record<string, string | number | boolean> = {};
  if (insightsRecord) {
    for (const [key, entryValue] of Object.entries(insightsRecord)) {
      if (
        typeof entryValue === 'string' ||
        typeof entryValue === 'number' ||
        typeof entryValue === 'boolean'
      ) {
        insights[key] = entryValue;
      }
    }
  }

  return {
    status,
    requestedAt: typeof record.requestedAt === 'string' ? record.requestedAt : undefined,
    completedAt: typeof record.completedAt === 'string' ? record.completedAt : undefined,
    modelVersion: typeof record.modelVersion === 'string' ? record.modelVersion : undefined,
    jobId: typeof record.jobId === 'string' ? record.jobId : undefined,
    insights: Object.keys(insights).length > 0 ? insights : undefined,
  };
}

export function parseHighlightVideo(value: unknown, index: number): HighlightVideo | null {
  const record = asRecord(value);
  if (!record || typeof record.title !== 'string') {
    return null;
  }

  const id = typeof record.id === 'string' ? record.id : `video-${index}`;
  const now = new Date().toISOString();
  const category = validCategories.includes(record.category as VideoCategory)
    ? (record.category as VideoCategory)
    : 'skills';

  const uploadStatus = validUploadStatuses.includes(record.uploadStatus as VideoUploadStatus)
    ? (record.uploadStatus as VideoUploadStatus)
    : 'ready';

  return {
    id,
    title: record.title,
    description: typeof record.description === 'string' ? record.description : undefined,
    tags: parseTags(record.tags),
    category,
    match: typeof record.match === 'string' ? record.match : undefined,
    opponent: typeof record.opponent === 'string' ? record.opponent : undefined,
    competition: typeof record.competition === 'string' ? record.competition : undefined,
    date: typeof record.date === 'string' ? record.date : now,
    durationSec: typeof record.durationSec === 'number' ? record.durationSec : 0,
    videoUrl: typeof record.videoUrl === 'string' ? record.videoUrl : '',
    thumbnailUrl: typeof record.thumbnailUrl === 'string' ? record.thumbnailUrl : '',
    storagePath:
      typeof record.storagePath === 'string'
        ? record.storagePath
        : VIDEO_STORAGE_PATHS.video('unknown', id),
    thumbnailStoragePath:
      typeof record.thumbnailStoragePath === 'string' ? record.thumbnailStoragePath : undefined,
    featured: record.featured === true,
    sortOrder: typeof record.sortOrder === 'number' ? record.sortOrder : index,
    fileSizeBytes: typeof record.fileSizeBytes === 'number' ? record.fileSizeBytes : undefined,
    uploadStatus,
    uploadError: typeof record.uploadError === 'string' ? record.uploadError : undefined,
    analysis: parseAnalysis(record.analysis),
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now,
  };
}

export function parseHighlightVideoLibrary(value: unknown): HighlightVideoLibrary {
  const record = asRecord(value);
  if (!record) {
    return { videos: [], updatedAt: new Date().toISOString() };
  }

  const videos: HighlightVideo[] = [];
  if (Array.isArray(record.videos)) {
    record.videos.forEach((item, index) => {
      const video = parseHighlightVideo(item, index);
      if (video) {
        videos.push(video);
      }
    });
  }

  return {
    videos: sortHighlightVideos(videos),
    featuredVideoId:
      typeof record.featuredVideoId === 'string' ? record.featuredVideoId : undefined,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
  };
}

function omitUndefinedFields(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  );
}

export function serializeHighlightVideo(video: HighlightVideo): Record<string, unknown> {
  return omitUndefinedFields({
    id: video.id,
    title: video.title,
    description: video.description,
    tags: video.tags,
    category: video.category,
    match: video.match,
    opponent: video.opponent,
    competition: video.competition,
    date: video.date,
    durationSec: video.durationSec,
    videoUrl: video.videoUrl,
    thumbnailUrl: video.thumbnailUrl,
    storagePath: video.storagePath,
    thumbnailStoragePath: video.thumbnailStoragePath,
    featured: video.featured,
    sortOrder: video.sortOrder,
    fileSizeBytes: video.fileSizeBytes,
    uploadStatus: video.uploadStatus,
    uploadError: video.uploadError,
    analysis: omitUndefinedFields({ ...video.analysis }),
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
  });
}

export function serializeHighlightVideoLibrary(
  library: HighlightVideoLibrary,
): Record<string, unknown> {
  return omitUndefinedFields({
    videos: library.videos.map(serializeHighlightVideo),
    featuredVideoId: library.featuredVideoId,
    updatedAt: library.updatedAt,
  });
}

export function sortHighlightVideos(videos: HighlightVideo[]): HighlightVideo[] {
  return [...videos].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function createHighlightVideoId(): string {
  return `video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyHighlightVideo(category: VideoCategory = 'skills'): HighlightVideo {
  const now = new Date().toISOString();
  const id = createHighlightVideoId();

  return {
    id,
    title: '',
    tags: [],
    category,
    date: now,
    durationSec: 0,
    videoUrl: '',
    thumbnailUrl: '',
    storagePath: VIDEO_STORAGE_PATHS.video('pending', id),
    featured: false,
    sortOrder: 0,
    uploadStatus: 'pending',
    analysis: { ...DEFAULT_VIDEO_ANALYSIS },
    createdAt: now,
    updatedAt: now,
  };
}

export function reorderHighlightVideos(
  videos: HighlightVideo[],
  orderedIds: string[],
): HighlightVideo[] {
  const map = new Map(videos.map((video) => [video.id, video]));
  const reordered: HighlightVideo[] = [];

  orderedIds.forEach((id, index) => {
    const video = map.get(id);
    if (video) {
      reordered.push({ ...video, sortOrder: index, updatedAt: new Date().toISOString() });
      map.delete(id);
    }
  });

  const remaining = sortHighlightVideos(Array.from(map.values())).map((video, offset) => ({
    ...video,
    sortOrder: reordered.length + offset,
    updatedAt: new Date().toISOString(),
  }));

  return [...reordered, ...remaining];
}

export function setFeaturedHighlightVideo(
  library: HighlightVideoLibrary,
  videoId: string | null,
): HighlightVideoLibrary {
  const videos = library.videos.map((video) => ({
    ...video,
    featured: videoId !== null && video.id === videoId,
    updatedAt: new Date().toISOString(),
  }));

  return {
    videos,
    featuredVideoId: videoId ?? undefined,
    updatedAt: new Date().toISOString(),
  };
}

export function getFeaturedHighlightVideo(
  library: HighlightVideoLibrary,
): HighlightVideo | null {
  if (library.featuredVideoId) {
    const featured = library.videos.find((video) => video.id === library.featuredVideoId);
    if (featured) {
      return featured;
    }
  }
  return library.videos.find((video) => video.featured && video.uploadStatus === 'ready') ?? null;
}

export function formatVideoDuration(durationSec: number): string {
  const minutes = Math.floor(durationSec / 60);
  const seconds = Math.floor(durationSec % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function filterVideosByCategory(
  videos: HighlightVideo[],
  category: VideoCategory | 'all',
): HighlightVideo[] {
  if (category === 'all') {
    return videos;
  }
  return videos.filter((video) => video.category === category);
}

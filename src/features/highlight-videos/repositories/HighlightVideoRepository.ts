import { type HighlightVideoLibrary } from '@/features/highlight-videos/types';
import { type CompressedVideoResult } from '@/features/highlight-videos/types';
import { type GeneratedThumbnail } from '@/features/highlight-videos/services/videoThumbnailService';
import {
  createHighlightVideoId,
  serializeHighlightVideoLibrary,
  sortHighlightVideos,
} from '@/features/highlight-videos/models/HighlightVideoModel';
import { VIDEO_STORAGE_PATHS } from '@/features/highlight-videos/constants';
import { PlayerProfileRepository } from '@/features/player-profile/repositories/PlayerProfileRepository';
import {
  deleteVideoStorageFiles,
  uploadThumbnailBlob,
  uploadVideoBlob,
} from '@/features/highlight-videos/services/highlightVideoStorageService';
import { type HighlightVideo } from '@/features/highlight-videos/types';

export type UploadHighlightVideoInput = {
  userId: string;
  library: HighlightVideoLibrary;
  compressed: CompressedVideoResult;
  thumbnail: GeneratedThumbnail;
  metadata: Omit<
    HighlightVideo,
    | 'id'
    | 'videoUrl'
    | 'thumbnailUrl'
    | 'storagePath'
    | 'thumbnailStoragePath'
    | 'fileSizeBytes'
    | 'uploadStatus'
    | 'uploadError'
    | 'createdAt'
    | 'updatedAt'
    | 'analysis'
  >;
  onProgress?: (progress: number, phase: 'thumbnail' | 'video') => void;
};

export class HighlightVideoRepository {
  private static instance: HighlightVideoRepository | null = null;

  private constructor() {}

  public static getInstance(): HighlightVideoRepository {
    if (!this.instance) {
      this.instance = new HighlightVideoRepository();
    }
    return this.instance;
  }

  public async saveLibrary(userId: string, library: HighlightVideoLibrary): Promise<void> {
    const profileRepository = PlayerProfileRepository.getInstance();
    await profileRepository.updateProfile(userId, {
      highlightVideos: library,
    });
  }

  public async uploadHighlightVideo(input: UploadHighlightVideoInput): Promise<HighlightVideo> {
    const videoId = createHighlightVideoId();
    const now = new Date().toISOString();

    const pendingVideo: HighlightVideo = {
      ...input.metadata,
      id: videoId,
      videoUrl: '',
      thumbnailUrl: input.thumbnail.uri,
      storagePath: VIDEO_STORAGE_PATHS.video(input.userId, videoId),
      thumbnailStoragePath: VIDEO_STORAGE_PATHS.thumbnail(input.userId, videoId),
      fileSizeBytes: input.compressed.fileSizeBytes,
      uploadStatus: 'uploading',
      analysis: { status: 'none' },
      createdAt: now,
      updatedAt: now,
    };

    const uploadingLibrary: HighlightVideoLibrary = {
      videos: sortHighlightVideos([...input.library.videos, pendingVideo]),
      featuredVideoId: input.library.featuredVideoId,
      updatedAt: now,
    };

    await this.saveLibrary(input.userId, uploadingLibrary);

    try {
      const thumbnailUpload = await uploadThumbnailBlob(
        input.userId,
        videoId,
        input.thumbnail.uri,
        {
          onProgress: (progress) => input.onProgress?.(progress, 'thumbnail'),
        },
      );

      const videoUpload = await uploadVideoBlob(
        input.userId,
        videoId,
        input.compressed.uri,
        {
          onProgress: (progress) => input.onProgress?.(progress, 'video'),
        },
      );

      const readyVideo: HighlightVideo = {
        ...pendingVideo,
        thumbnailUrl: thumbnailUpload.downloadUrl,
        videoUrl: videoUpload.downloadUrl,
        storagePath: videoUpload.storagePath,
        thumbnailStoragePath: thumbnailUpload.storagePath,
        fileSizeBytes: videoUpload.fileSizeBytes,
        uploadStatus: 'ready',
        uploadError: undefined,
        updatedAt: new Date().toISOString(),
      };

      const nextVideos = uploadingLibrary.videos.map((video) =>
        video.id === videoId ? readyVideo : video,
      );

      const nextLibrary: HighlightVideoLibrary = {
        videos: sortHighlightVideos(nextVideos),
        featuredVideoId:
          input.library.featuredVideoId ??
          (input.metadata.featured ? videoId : uploadingLibrary.featuredVideoId),
        updatedAt: new Date().toISOString(),
      };

      await this.saveLibrary(input.userId, nextLibrary);
      return readyVideo;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed.';
      const failedLibrary: HighlightVideoLibrary = {
        videos: uploadingLibrary.videos.map((video) =>
          video.id === videoId
            ? { ...video, uploadStatus: 'failed', uploadError: message, updatedAt: new Date().toISOString() }
            : video,
        ),
        featuredVideoId: uploadingLibrary.featuredVideoId,
        updatedAt: new Date().toISOString(),
      };
      await this.saveLibrary(input.userId, failedLibrary);
      throw error;
    }
  }

  public async retryUpload(
    userId: string,
    library: HighlightVideoLibrary,
    videoId: string,
    compressed: CompressedVideoResult,
    thumbnail: GeneratedThumbnail,
    onProgress?: (progress: number, phase: 'thumbnail' | 'video') => void,
  ): Promise<HighlightVideo> {
    const existing = library.videos.find((video) => video.id === videoId);
    if (!existing) {
      throw new Error('Video not found.');
    }

    const metadata = {
      title: existing.title,
      description: existing.description,
      tags: existing.tags,
      category: existing.category,
      match: existing.match,
      opponent: existing.opponent,
      competition: existing.competition,
      date: existing.date,
      durationSec: existing.durationSec,
      featured: existing.featured,
      sortOrder: existing.sortOrder,
    };

    const withoutFailed = {
      ...library,
      videos: library.videos.filter((video) => video.id !== videoId),
    };

    return this.uploadHighlightVideo({
      userId,
      library: withoutFailed,
      compressed,
      thumbnail,
      metadata,
      onProgress,
    });
  }

  public async deleteHighlightVideo(
    userId: string,
    library: HighlightVideoLibrary,
    videoId: string,
  ): Promise<HighlightVideoLibrary> {
    const target = library.videos.find((video) => video.id === videoId);
    if (!target) {
      return library;
    }

    if (target.storagePath && target.uploadStatus === 'ready') {
      await deleteVideoStorageFiles(target.storagePath, target.thumbnailStoragePath);
    }

    const nextLibrary: HighlightVideoLibrary = {
      videos: sortHighlightVideos(
        library.videos
          .filter((video) => video.id !== videoId)
          .map((video, index) => ({ ...video, sortOrder: index })),
      ),
      featuredVideoId: library.featuredVideoId === videoId ? undefined : library.featuredVideoId,
      updatedAt: new Date().toISOString(),
    };

    await this.saveLibrary(userId, nextLibrary);
    return nextLibrary;
  }

  public async updateHighlightVideo(
    userId: string,
    library: HighlightVideoLibrary,
    video: HighlightVideo,
  ): Promise<HighlightVideoLibrary> {
    const nextLibrary: HighlightVideoLibrary = {
      videos: sortHighlightVideos(
        library.videos.map((item) =>
          item.id === video.id ? { ...video, updatedAt: new Date().toISOString() } : item,
        ),
      ),
      featuredVideoId: video.featured ? video.id : library.featuredVideoId,
      updatedAt: new Date().toISOString(),
    };

    if (video.featured) {
      nextLibrary.videos = nextLibrary.videos.map((item) => ({
        ...item,
        featured: item.id === video.id,
      }));
      nextLibrary.featuredVideoId = video.id;
    }

    await this.saveLibrary(userId, nextLibrary);
    return nextLibrary;
  }

  public buildLibraryPayload(library: HighlightVideoLibrary): Record<string, unknown> {
    return serializeHighlightVideoLibrary(library);
  }
}

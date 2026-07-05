import { useCallback, useMemo, useState } from 'react';
import { HighlightVideoRepository } from '@/features/highlight-videos/repositories/HighlightVideoRepository';
import {
  reorderHighlightVideos,
  setFeaturedHighlightVideo,
} from '@/features/highlight-videos/models/HighlightVideoModel';
import { compressHighlightVideo } from '@/features/highlight-videos/services/videoCompressionService';
import { pickHighlightVideo } from '@/features/highlight-videos/services/videoPickerService';
import { generateVideoThumbnail } from '@/features/highlight-videos/services/videoThumbnailService';
import {
  type HighlightVideo,
  type HighlightVideoLibrary,
  type VideoUploadProgress,
  emptyHighlightVideoLibrary,
} from '@/features/highlight-videos/types';
import { type PlayerProfile } from '@/features/player-profile/types';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { ActivityRecorder } from '@/features/activity-feed/services/activityRecorder';

export function useHighlightVideos(profile: PlayerProfile | null | undefined) {
  const { user } = useAuth();
  const [uploadProgress, setUploadProgress] = useState<VideoUploadProgress | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingRetryUri, setPendingRetryUri] = useState<Record<string, string>>({});

  const library = useMemo<HighlightVideoLibrary>(
    () => profile?.highlightVideos ?? emptyHighlightVideoLibrary(),
    [profile?.highlightVideos],
  );

  const readyVideos = useMemo(
    () => library.videos.filter((video) => video.uploadStatus === 'ready'),
    [library.videos],
  );

  const repository = useMemo(() => HighlightVideoRepository.getInstance(), []);

  const recordVideoUploaded = useCallback(
    (video: HighlightVideo) => {
      if (!user?.id) {
        return;
      }
      ActivityRecorder.getInstance().recordVideoUploaded({
        playerId: user.id,
        playerName: profile?.fullName ?? user.name,
        videoId: video.id,
        videoTitle: video.title,
      });
    },
    [profile?.fullName, user?.id, user?.name],
  );

  const uploadWithMetadata = useCallback(
    async (metadata: Omit<HighlightVideo, 'id' | 'videoUrl' | 'thumbnailUrl' | 'storagePath' | 'thumbnailStoragePath' | 'fileSizeBytes' | 'uploadStatus' | 'uploadError' | 'createdAt' | 'updatedAt' | 'analysis'>) => {
      if (!user?.id) {
        throw new Error('User is not authenticated.');
      }

      setIsUploading(true);
      setUploadProgress(null);

      try {
        const picked = await pickHighlightVideo();
        if (!picked) {
          return null;
        }

        const compressed = await compressHighlightVideo(picked);
        const thumbnail = await generateVideoThumbnail(compressed.uri);

        const video = await repository.uploadHighlightVideo({
          userId: user.id,
          library,
          compressed,
          thumbnail,
          metadata: {
            ...metadata,
            durationSec: compressed.durationSec,
            sortOrder: library.videos.length,
          },
          onProgress: (progress, phase) => {
            setUploadProgress({
              videoId: 'uploading',
              progress,
              bytesTransferred: 0,
              totalBytes: compressed.fileSizeBytes,
              phase,
            });
          },
        });

        if (video.uploadStatus === 'ready') {
          recordVideoUploaded(video);
        }

        return video;
      } finally {
        setIsUploading(false);
        setUploadProgress(null);
      }
    },
    [library, recordVideoUploaded, repository, user?.id],
  );

  const pickAndPrepareUpload = useCallback(async () => {
    const picked = await pickHighlightVideo();
    if (!picked) {
      return null;
    }

    const compressed = await compressHighlightVideo(picked);
    const thumbnail = await generateVideoThumbnail(compressed.uri);

    return { picked, compressed, thumbnail };
  }, []);

  const completeUpload = useCallback(
    async (
      prepared: Awaited<ReturnType<typeof pickAndPrepareUpload>>,
      metadata: Omit<HighlightVideo, 'id' | 'videoUrl' | 'thumbnailUrl' | 'storagePath' | 'thumbnailStoragePath' | 'fileSizeBytes' | 'uploadStatus' | 'uploadError' | 'createdAt' | 'updatedAt' | 'analysis'>,
    ) => {
      if (!user?.id || !prepared) {
        throw new Error('Upload preparation failed.');
      }

      setIsUploading(true);
      try {
        return await repository.uploadHighlightVideo({
          userId: user.id,
          library,
          compressed: prepared.compressed,
          thumbnail: prepared.thumbnail,
          metadata: {
            ...metadata,
            durationSec: prepared.compressed.durationSec,
            sortOrder: library.videos.length,
          },
          onProgress: (progress, phase) => {
            setUploadProgress({
              videoId: 'uploading',
              progress,
              bytesTransferred: 0,
              totalBytes: prepared.compressed.fileSizeBytes,
              phase,
            });
          },
        }).then((video) => {
          if (video.uploadStatus === 'ready') {
            recordVideoUploaded(video);
          }
          return video;
        });
      } finally {
        setIsUploading(false);
        setUploadProgress(null);
      }
    },
    [library, recordVideoUploaded, repository, user?.id],
  );

  const deleteVideo = useCallback(
    async (videoId: string) => {
      if (!user?.id) {
        throw new Error('User is not authenticated.');
      }
      return repository.deleteHighlightVideo(user.id, library, videoId);
    },
    [library, repository, user?.id],
  );

  const updateVideo = useCallback(
    async (video: HighlightVideo) => {
      if (!user?.id) {
        throw new Error('User is not authenticated.');
      }
      return repository.updateHighlightVideo(user.id, library, video);
    },
    [library, repository, user?.id],
  );

  const reorderVideos = useCallback(
    async (orderedIds: string[]) => {
      if (!user?.id) {
        throw new Error('User is not authenticated.');
      }
      const nextLibrary: HighlightVideoLibrary = {
        videos: reorderHighlightVideos(library.videos, orderedIds),
        featuredVideoId: library.featuredVideoId,
        updatedAt: new Date().toISOString(),
      };
      await repository.saveLibrary(user.id, nextLibrary);
      return nextLibrary;
    },
    [library, repository, user?.id],
  );

  const setFeatured = useCallback(
    async (videoId: string | null) => {
      if (!user?.id) {
        throw new Error('User is not authenticated.');
      }
      const nextLibrary = setFeaturedHighlightVideo(library, videoId);
      await repository.saveLibrary(user.id, nextLibrary);
      return nextLibrary;
    },
    [library, repository, user?.id],
  );

  const retryUpload = useCallback(
    async (videoId: string) => {
      if (!user?.id) {
        throw new Error('User is not authenticated.');
      }

      const localUri = pendingRetryUri[videoId];
      if (!localUri) {
        const picked = await pickHighlightVideo();
        if (!picked) {
          return null;
        }
        const compressed = await compressHighlightVideo(picked);
        const thumbnail = await generateVideoThumbnail(compressed.uri);
        setPendingRetryUri((current) => ({ ...current, [videoId]: compressed.uri }));

        setIsUploading(true);
        try {
          const video = await repository.retryUpload(
            user.id,
            library,
            videoId,
            compressed,
            thumbnail,
            (progress, phase) => {
              setUploadProgress({
                videoId,
                progress,
                bytesTransferred: 0,
                totalBytes: compressed.fileSizeBytes,
                phase,
              });
            },
          );
          if (video?.uploadStatus === 'ready') {
            recordVideoUploaded(video);
          }
          return video;
        } finally {
          setIsUploading(false);
          setUploadProgress(null);
        }
      }

      const compressed = await compressHighlightVideo({
        uri: localUri,
        durationSec: library.videos.find((v) => v.id === videoId)?.durationSec ?? 0,
      });
      const thumbnail = await generateVideoThumbnail(compressed.uri);

      setIsUploading(true);
      try {
        const video = await repository.retryUpload(
          user.id,
          library,
          videoId,
          compressed,
          thumbnail,
          (progress, phase) => {
            setUploadProgress({
              videoId,
              progress,
              bytesTransferred: 0,
              totalBytes: compressed.fileSizeBytes,
              phase,
            });
          },
        );
        if (video?.uploadStatus === 'ready') {
          recordVideoUploaded(video);
        }
        return video;
      } finally {
        setIsUploading(false);
        setUploadProgress(null);
      }
    },
    [library, pendingRetryUri, recordVideoUploaded, repository, user?.id],
  );

  return {
    library,
    readyVideos,
    uploadProgress,
    isUploading,
    uploadWithMetadata,
    pickAndPrepareUpload,
    completeUpload,
    deleteVideo,
    updateVideo,
    reorderVideos,
    setFeatured,
    retryUpload,
  };
}

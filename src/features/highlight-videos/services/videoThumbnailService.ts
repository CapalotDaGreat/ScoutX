import * as VideoThumbnails from 'expo-video-thumbnails';
import { VIDEO_STORAGE_LIMITS } from '@/features/highlight-videos/constants';

export type GeneratedThumbnail = {
  uri: string;
  width: number;
  height: number;
};

export async function generateVideoThumbnail(videoUri: string): Promise<GeneratedThumbnail> {
  const timeMs = 1000;
  const result = await VideoThumbnails.getThumbnailAsync(videoUri, {
    time: timeMs,
    quality: VIDEO_STORAGE_LIMITS.thumbnailQuality,
  });

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
  };
}

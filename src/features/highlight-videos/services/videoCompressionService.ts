import * as FileSystem from 'expo-file-system/legacy';
import { VIDEO_STORAGE_LIMITS } from '@/features/highlight-videos/constants';
import { type CompressedVideoResult, type PickedVideoAsset } from '@/features/highlight-videos/types';

export type VideoCompressionErrorCode = 'too_large' | 'too_long' | 'unreadable';

export class VideoCompressionError extends Error {
  public readonly code: VideoCompressionErrorCode;

  constructor(code: VideoCompressionErrorCode, message: string) {
    super(message);
    this.name = 'VideoCompressionError';
    this.code = code;
  }
}

/**
 * Validates size/duration of a picked clip. The picker itself is asked for medium quality;
 * no transcoding happens here, so `compressionApplied` is reported as false until a native
 * transcoder is plugged in.
 */
export async function compressHighlightVideo(
  asset: PickedVideoAsset,
): Promise<CompressedVideoResult> {
  if (asset.durationSec > VIDEO_STORAGE_LIMITS.maxDurationSec) {
    throw new VideoCompressionError(
      'too_long',
      `Highlight clips must be ${VIDEO_STORAGE_LIMITS.maxDurationSec} seconds or shorter. Trim a moment from your Veo export, or upload the full match under Growth → Analyze match video.`,
    );
  }

  let fileSizeBytes = asset.fileSizeBytes ?? 0;

  if (!fileSizeBytes) {
    const info = await FileSystem.getInfoAsync(asset.uri);
    if (info.exists && 'size' in info && typeof info.size === 'number') {
      fileSizeBytes = info.size;
    }
  }

  if (fileSizeBytes > VIDEO_STORAGE_LIMITS.maxFileSizeBytes) {
    throw new VideoCompressionError(
      'too_large',
      'Video file is too large. Choose a shorter clip or lower quality export.',
    );
  }

  return {
    uri: asset.uri,
    fileSizeBytes,
    durationSec: asset.durationSec,
    // No transcoding happens in this service; only picker-quality selection and validation.
    compressionApplied: false,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

import { VIDEO_STORAGE_LIMITS } from '@/features/highlight-videos/constants';
import type { GeneratedThumbnail } from './videoThumbnailService';

class WebVideoThumbnailError extends Error {
  readonly code = 'thumbnail_unavailable';
}

/** Extracts a real local frame; never uploads footage or substitutes a fabricated image. */
export async function generateVideoThumbnail(videoUri: string): Promise<GeneratedThumbnail> {
  if (!videoUri.startsWith('blob:') && !videoUri.startsWith('data:video/')) {
    throw new WebVideoThumbnailError('Choose a local video to create its thumbnail.');
  }
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    let finished = false;
    const cleanup = () => {
      clearTimeout(timeout);
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
    };
    const fail = (error: Error) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(error);
    };
    const timeout = setTimeout(() => fail(new WebVideoThumbnailError('Video thumbnail could not finish.')), 15_000);
    const draw = () => {
      if (finished) return;
      try {
        if (!video.videoWidth || !video.videoHeight) throw new Error('The selected video has no readable frame.');
        const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Video thumbnail canvas is unavailable.');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const uri = canvas.toDataURL('image/jpeg', VIDEO_STORAGE_LIMITS.thumbnailQuality);
        finished = true;
        cleanup();
        resolve({ uri, width: canvas.width, height: canvas.height });
      } catch (error) {
        fail(new WebVideoThumbnailError(error instanceof Error ? error.message : 'Unable to create a video thumbnail.'));
      }
    };
    video.onerror = () => fail(new WebVideoThumbnailError('This browser could not decode the selected video.'));
    video.onseeked = draw;
    video.onloadeddata = () => {
      const time = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(1, video.duration / 2) : 0;
      if (time > 0) video.currentTime = time;
      else draw();
    };
    video.src = videoUri;
    video.load();
  });
}

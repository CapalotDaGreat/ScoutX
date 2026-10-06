import * as VideoThumbnails from 'expo-video-thumbnails';
import { MATCH_ANALYSIS_LIMITS } from '@/features/match-analysis/constants';

export type SampledFrame = {
  id: string;
  index: number;
  timestampSec: number;
  uri: string;
};

/**
 * Sample evenly spaced still frames across the match for vision analysis.
 * Avoids requiring server-side ffmpeg for the MVP.
 */
export async function sampleMatchFrames(
  videoUri: string,
  durationSec: number,
  frameCount = MATCH_ANALYSIS_LIMITS.sampleFrameCount,
): Promise<SampledFrame[]> {
  const safeDuration = Math.max(durationSec, 1);
  const count = Math.max(6, Math.min(frameCount, 24));
  const frames: SampledFrame[] = [];

  for (let i = 0; i < count; i += 1) {
    const ratio = count === 1 ? 0.5 : i / (count - 1);
    // Skip extreme start/end logos/credits bias slightly inward
    const timestampSec = Math.min(
      safeDuration - 1,
      Math.max(1, Math.round(safeDuration * (0.04 + ratio * 0.92))),
    );
    const timeMs = timestampSec * 1000;

    try {
      const thumb = await VideoThumbnails.getThumbnailAsync(videoUri, {
        time: timeMs,
        quality: MATCH_ANALYSIS_LIMITS.frameThumbnailQuality,
      });
      frames.push({
        id: `frame_${i}`,
        index: i,
        timestampSec,
        uri: thumb.uri,
      });
    } catch {
      // Skip failed timestamps (common near EOF on some devices)
    }
  }

  if (frames.length < 4) {
    throw new Error('Could not extract enough frames from this video. Try another file.');
  }

  return frames;
}

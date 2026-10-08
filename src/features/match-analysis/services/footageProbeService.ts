import { createVideoPlayer } from 'expo-video';

const LOAD_TIMEOUT_MS = 15_000;

export type FootageTrackInfo = {
  durationSec: number | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  trackBitrate: number | null;
  trackSupported: boolean | null;
};

/**
 * Reads container and track metadata via the system player (AVFoundation on iOS). Only headers
 * are parsed; no frames are decoded and nothing leaves the phone.
 */
export async function readFootageTrackInfo(uri: string): Promise<FootageTrackInfo | null> {
  const player = createVideoPlayer(uri);
  try {
    return await new Promise<FootageTrackInfo | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), LOAD_TIMEOUT_MS);
      const subscription = player.addListener('sourceLoad', ({ duration, availableVideoTracks }) => {
        clearTimeout(timer);
        subscription.remove();
        const track = availableVideoTracks[0] ?? null;
        resolve({
          durationSec: Number.isFinite(duration) && duration > 0 ? duration : null,
          width: track?.size?.width || null,
          height: track?.size?.height || null,
          frameRate: track?.frameRate ?? null,
          trackBitrate: track?.averageBitrate ?? null,
          trackSupported: typeof track?.isSupported === 'boolean' ? track.isSupported : null,
        });
      });
    });
  } finally {
    player.release();
  }
}

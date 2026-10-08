import { getDocumentAsync } from 'expo-document-picker';
import { Paths } from 'expo-file-system';
import { createVideoPlayer } from 'expo-video';
import { MATCH_ANALYSIS_LIMITS } from '@/features/match-analysis/constants';
import { type PickedVideoAsset } from '@/features/highlight-videos/types';

export const FILE_PICK_ERRORS = ['unsupported', 'too_long', 'too_large', 'no_duration', 'low_disk'] as const;
export type FilePickErrorCode = (typeof FILE_PICK_ERRORS)[number];

export class FilePickError extends Error {
  constructor(readonly code: FilePickErrorCode) {
    super(code);
    this.name = 'FilePickError';
  }
}

/** Headroom kept free for sampled frames and upload bookkeeping. */
const MIN_FREE_BYTES = 300 * 1024 * 1024;
const DURATION_TIMEOUT_MS = 15_000;
const ACCEPTED_TYPES = ['video/mp4', 'video/quicktime'];

function hasAcceptedExtension(name: string): boolean {
  return /\.(mp4|mov|m4v)$/i.test(name);
}

/** Reads the duration from the file itself; nothing is guessed when the file will not load. */
async function readDurationSec(uri: string): Promise<number | null> {
  const player = createVideoPlayer(uri);
  try {
    return await new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), DURATION_TIMEOUT_MS);
      const subscription = player.addListener('sourceLoad', ({ duration }) => {
        clearTimeout(timer);
        subscription.remove();
        resolve(Number.isFinite(duration) && duration > 0 ? duration : null);
      });
    });
  } finally {
    player.release();
  }
}

/**
 * Opens the Files app (including iCloud Drive). iOS downloads iCloud-only files before
 * returning, so the caller should show a "preparing" state while this runs.
 */
export async function pickMatchFootageFile(): Promise<PickedVideoAsset | null> {
  if (Paths.availableDiskSpace < MIN_FREE_BYTES) {
    throw new FilePickError('low_disk');
  }
  const result = await getDocumentAsync({ type: ACCEPTED_TYPES, copyToCacheDirectory: true, multiple: false });
  if (result.canceled || result.assets.length === 0) {
    return null;
  }
  const asset = result.assets[0];
  if (!ACCEPTED_TYPES.includes(asset.mimeType ?? '') && !hasAcceptedExtension(asset.name)) {
    throw new FilePickError('unsupported');
  }
  if (typeof asset.size === 'number' && asset.size > MATCH_ANALYSIS_LIMITS.maxFileSizeBytes) {
    throw new FilePickError('too_large');
  }
  const durationSec = await readDurationSec(asset.uri);
  if (durationSec === null) {
    throw new FilePickError('no_duration');
  }
  if (durationSec > MATCH_ANALYSIS_LIMITS.maxDurationSec) {
    throw new FilePickError('too_long');
  }
  return {
    uri: asset.uri,
    durationSec,
    fileSizeBytes: asset.size,
    fileName: asset.name,
  };
}

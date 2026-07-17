import { MATCH_ANALYSIS_LIMITS } from '@/features/match-analysis/constants';
import { launchVideoFromLibrary } from '@/features/highlight-videos/services/launchVideoFromLibrary';
import { type PickedVideoAsset } from '@/features/highlight-videos/types';

/**
 * Opens Photos / Gallery for full-match footage (Veo exports, phone recordings, etc.).
 *
 * Uses the fast no-transcode path first so long on-device matches load instantly;
 * iCloud-only matches fall back to a download+export attempt.
 */
export async function pickMatchFootageVideo(): Promise<PickedVideoAsset | null> {
  const picked = await launchVideoFromLibrary({
    // Editing caps ~10 min on iOS — keep off for full-match Veo film.
    allowsEditing: false,
    preferFastPath: true,
  });

  if (!picked) {
    return null;
  }

  if (picked.durationSec > MATCH_ANALYSIS_LIMITS.maxDurationSec) {
    throw new Error(
      `Match video must be ${MATCH_ANALYSIS_LIMITS.maxDurationSec / 60} minutes or shorter. Trim your Veo export or choose a shorter recording from Photos.`,
    );
  }

  if (
    typeof picked.fileSizeBytes === 'number' &&
    picked.fileSizeBytes > MATCH_ANALYSIS_LIMITS.maxFileSizeBytes
  ) {
    throw new Error(
      'This video file is too large to upload. Export a lower quality cut from Veo or choose a shorter recording from Photos / Gallery.',
    );
  }

  return picked;
}

import {
  VIDEO_STORAGE_LIMITS,
} from '@/features/highlight-videos/constants';
import { launchVideoFromLibrary } from '@/features/highlight-videos/services/launchVideoFromLibrary';
import { type PickedVideoAsset } from '@/features/highlight-videos/types';
import { Platform } from 'react-native';

/**
 * Opens the system Photos (iOS) / Gallery Photos (Android) picker for short scout clips.
 * Trim UI is enabled on iOS so longer library clips can be cut down before upload.
 */
export async function pickHighlightVideo(): Promise<PickedVideoAsset | null> {
  return launchVideoFromLibrary({
    allowsEditing: Platform.OS === 'ios',
    videoMaxDuration: VIDEO_STORAGE_LIMITS.maxDurationSec,
  });
}

import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import {
  ensureVideoLibraryPermission,
} from '@/features/highlight-videos/services/videoLibraryPermission';
import { materializePickedVideo } from '@/features/highlight-videos/services/materializePickedVideo';
import { type PickedVideoAsset } from '@/features/highlight-videos/types';

export type LaunchVideoLibraryOptions = {
  /** Enable trim UI (iOS). Caps edited length at ~10 minutes — only for short clips. */
  allowsEditing?: boolean;
  /** Max duration for the editor / camera, in seconds. */
  videoMaxDuration?: number;
  /**
   * Prefer the instant no-transcode path first (recommended for long match
   * footage). On-device videos load instantly; iCloud-only videos fall back to
   * a download+export attempt, which requires re-selecting the clip once.
   * When false (default, best for short clips), a single iCloud-capable attempt
   * is used so the user only picks once.
   */
  preferFastPath?: boolean;
};

function isPhotosExportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('PHPhotosErrorDomain') ||
    message.includes('error 3146') ||
    message.includes('error 3164') ||
    message.includes('Failed to read video') ||
    message.includes('Failed to pick video') ||
    message.includes('Failed to transcode') ||
    message.includes('iCloud')
  );
}

function isCancellation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('cancel');
}

export function photosExportErrorMessage(error: unknown): string {
  if (isPhotosExportError(error)) {
    return (
      'Photos still could not export this video. If it is stored in iCloud, make sure this ' +
      'device is online so PitchProof can download it, then try again. You can also open the clip ' +
      'in the Photos app once to download it, or pick a shorter export.'
    );
  }
  return error instanceof Error ? error.message : 'Could not pick video.';
}

async function resolvePickerResult(
  result: ImagePicker.ImagePickerResult,
): Promise<ImagePicker.ImagePickerAsset | null> {
  if (!result.canceled && result.assets?.length) {
    return result.assets[0] ?? null;
  }

  if (Platform.OS === 'android') {
    const pending = await ImagePicker.getPendingResultAsync();
    if (pending && 'assets' in pending && pending.assets?.length && !pending.canceled) {
      return pending.assets[0] ?? null;
    }
  }

  return null;
}

/**
 * Ordered picker configurations. We try the fastest option first, then fall
 * back to options that reliably pull iCloud-only assets over the network.
 *
 * iOS notes:
 * - `Passthrough` streams the original bytes with no transcode — instant for
 *   videos already on the device, but throws (PHPhotosErrorDomain 3146/3164)
 *   for iCloud-only assets because the fast-path skips network access.
 * - A concrete export preset routes through `loadFileRepresentation`, which
 *   asks iOS to download the asset from iCloud automatically before exporting.
 */
function buildAttempts(
  options: LaunchVideoLibraryOptions,
): ImagePicker.ImagePickerOptions[] {
  const base: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['videos'],
    allowsEditing: options.allowsEditing ?? false,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
    ...(typeof options.videoMaxDuration === 'number'
      ? { videoMaxDuration: options.videoMaxDuration }
      : {}),
  };

  if (Platform.OS === 'android') {
    return [
      {
        ...base,
        defaultTab: 'photos',
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      },
    ];
  }

  if (Platform.OS === 'web') {
    return [base];
  }

  // iCloud-capable attempt: routes through loadFileRepresentation, which asks
  // iOS to download the asset from iCloud before exporting. Works in a single
  // pick for both on-device and iCloud videos.
  const iCloudCapableAttempt: ImagePicker.ImagePickerOptions = {
    ...base,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
  };

  // Instant no-transcode attempt — great for long match footage already on the
  // device (avoids transcoding a full match), throws for iCloud-only assets.
  const fastPassthroughAttempt: ImagePicker.ImagePickerOptions = {
    ...base,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
    videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
  };

  if (options.preferFastPath) {
    return [fastPassthroughAttempt, iCloudCapableAttempt];
  }

  return [iCloudCapableAttempt];
}

/**
 * Open the system Photos / Gallery video picker so users can upload videos that
 * are already downloaded on the device OR still stored in iCloud. On-device
 * videos use the instant no-transcode path; iCloud-only videos automatically
 * download and export on the fallback attempt.
 */
export async function launchVideoFromLibrary(
  options: LaunchVideoLibraryOptions = {},
): Promise<PickedVideoAsset | null> {
  const granted = await ensureVideoLibraryPermission();
  if (!granted) {
    return null;
  }

  const attempts = buildAttempts(options);
  let lastError: unknown = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const isLastAttempt = index === attempts.length - 1;

    try {
      const result = await ImagePicker.launchImageLibraryAsync(attempts[index]);
      const asset = await resolvePickerResult(result);
      // User cancelled — respect it, don't keep retrying.
      if (result.canceled && !asset) {
        return null;
      }
      if (!asset) {
        return null;
      }
      return await materializePickedVideo(asset);
    } catch (error) {
      lastError = error;

      if (isCancellation(error)) {
        return null;
      }

      // Only fall through to the next (iCloud-capable) attempt for export errors.
      if (!isLastAttempt && isPhotosExportError(error)) {
        continue;
      }

      throw new Error(photosExportErrorMessage(error));
    }
  }

  throw new Error(photosExportErrorMessage(lastError));
}

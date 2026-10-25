import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { type ImagePickerAsset } from 'expo-image-picker';
import { type PickedVideoAsset } from '@/features/highlight-videos/types';

function guessVideoExtension(asset: ImagePickerAsset): string {
  const fromName = asset.fileName?.match(/\.([a-z0-9]+)$/i)?.[1];
  if (fromName) {
    return `.${fromName.toLowerCase()}`;
  }
  if (asset.mimeType?.includes('quicktime') || asset.uri.includes('.mov')) {
    return '.mov';
  }
  if (asset.mimeType?.includes('webm')) {
    return '.webm';
  }
  return '.mp4';
}

function needsLocalCopy(uri: string): boolean {
  if (Platform.OS === 'web') {
    return false;
  }
  // Android Photo Picker returns content:// URIs that expire / can't always be fetched later.
  // iOS may return ph:// or assets-library:// until exported to a file:// path.
  return (
    uri.startsWith('content://') ||
    uri.startsWith('ph://') ||
    uri.startsWith('assets-library://') ||
    !uri.startsWith('file://')
  );
}

/**
 * Copy a Photos/Gallery pick into the app cache so compression, thumbnails,
 * and Firebase upload can reliably read the file on both iOS and Android.
 */
export async function materializePickedVideo(
  asset: ImagePickerAsset,
): Promise<PickedVideoAsset> {
  const durationSec = asset.duration
    ? Math.round(Platform.OS === 'web' ? asset.duration : asset.duration / 1000)
    : 0;
  const fileName = asset.fileName ?? undefined;
  const extension = guessVideoExtension(asset);

  if (!needsLocalCopy(asset.uri) || !FileSystem.cacheDirectory) {
    let fileSizeBytes = asset.fileSize;
    if (!fileSizeBytes) {
      try {
        const info = await FileSystem.getInfoAsync(asset.uri);
        if (info.exists && 'size' in info && typeof info.size === 'number') {
          fileSizeBytes = info.size;
        }
      } catch {
        // Keep undefined — callers validate later.
      }
    }

    return {
      uri: asset.uri,
      durationSec,
      fileSizeBytes,
      fileName,
    };
  }

  const destination = `${FileSystem.cacheDirectory}scoutx-pick-${Date.now()}${extension}`;
  await FileSystem.copyAsync({ from: asset.uri, to: destination });

  const info = await FileSystem.getInfoAsync(destination);
  const fileSizeBytes =
    info.exists && 'size' in info && typeof info.size === 'number'
      ? info.size
      : asset.fileSize;

  return {
    uri: destination,
    durationSec,
    fileSizeBytes,
    fileName: fileName ?? `video${extension}`,
  };
}

import * as ImagePicker from 'expo-image-picker';
import {
  VIDEO_STORAGE_LIMITS,
} from '@/features/highlight-videos/constants';
import { type PickedVideoAsset } from '@/features/highlight-videos/types';

export async function requestVideoLibraryPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}

export async function pickHighlightVideo(): Promise<PickedVideoAsset | null> {
  const granted = await requestVideoLibraryPermission();
  if (!granted) {
    throw new Error('Permission to access the media library is required.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    allowsEditing: true,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    videoMaxDuration: VIDEO_STORAGE_LIMITS.maxDurationSec,
  });

  if (result.canceled || !result.assets?.length) {
    return null;
  }

  const asset = result.assets[0];
  const durationSec = asset.duration ? Math.round(asset.duration / 1000) : 0;

  return {
    uri: asset.uri,
    durationSec,
    fileSizeBytes: asset.fileSize,
    fileName: asset.fileName ?? undefined,
  };
}

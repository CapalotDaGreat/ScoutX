import * as ImagePicker from 'expo-image-picker';
import { MATCH_ANALYSIS_LIMITS } from '@/features/match-analysis/constants';
import { type PickedVideoAsset } from '@/features/highlight-videos/types';

export async function pickMatchFootageVideo(): Promise<PickedVideoAsset | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Permission to access the media library is required.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    allowsEditing: false,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    // Allow long fixtures; device still may truncate depending on OS.
    videoMaxDuration: MATCH_ANALYSIS_LIMITS.maxDurationSec,
  });

  if (result.canceled || !result.assets?.length) {
    return null;
  }

  const asset = result.assets[0];
  const durationSec = asset.duration ? Math.round(asset.duration / 1000) : 0;

  if (durationSec > MATCH_ANALYSIS_LIMITS.maxDurationSec) {
    throw new Error(
      `Match video must be ${MATCH_ANALYSIS_LIMITS.maxDurationSec / 60} minutes or shorter.`,
    );
  }

  if (
    typeof asset.fileSize === 'number' &&
    asset.fileSize > MATCH_ANALYSIS_LIMITS.maxFileSizeBytes
  ) {
    throw new Error('This video file is too large to upload. Compress it or choose a shorter cut.');
  }

  return {
    uri: asset.uri,
    durationSec,
    fileSizeBytes: asset.fileSize,
    fileName: asset.fileName ?? undefined,
  };
}

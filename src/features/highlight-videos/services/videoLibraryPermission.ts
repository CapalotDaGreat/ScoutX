import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking, Platform } from 'react-native';

function isMediaLibraryUsable(
  response: ImagePicker.MediaLibraryPermissionResponse,
): boolean {
  if (response.granted) {
    return true;
  }
  // iOS 14+ / Android 14+ "Select Photos" limited access still allows picking.
  return response.accessPrivileges === 'limited' || response.accessPrivileges === 'all';
}

/**
 * Android 13+ uses the system Photo Picker and does not need READ_MEDIA_*.
 * Older Android still needs READ_EXTERNAL_STORAGE for the gallery.
 * iOS needs library access before exporting videos (avoids post-pick dialogs
 * and PHPhotosErrorDomain failures for original assets).
 */
export async function requestVideoLibraryPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return true;
  }

  if (Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 33) {
    return true;
  }

  // Always re-request on iOS when undetermined so Photos export has a granted token.
  const existing = await ImagePicker.getMediaLibraryPermissionsAsync(false);
  if (isMediaLibraryUsable(existing)) {
    return true;
  }

  if (existing.canAskAgain === false && existing.status === ImagePicker.PermissionStatus.DENIED) {
    return false;
  }

  const requested = await ImagePicker.requestMediaLibraryPermissionsAsync(false);
  return isMediaLibraryUsable(requested);
}

export function showVideoLibraryPermissionAlert(): void {
  Alert.alert(
    'Photo library access needed',
    Platform.OS === 'ios'
      ? 'PitchProof needs access to Photos so you can upload highlight clips and match recordings from your library.'
      : 'PitchProof needs access to your Gallery / Photos so you can upload highlight clips and match recordings.',
    [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Open settings',
        onPress: () => {
          void Linking.openSettings();
        },
      },
    ],
  );
}

export async function ensureVideoLibraryPermission(): Promise<boolean> {
  const granted = await requestVideoLibraryPermission();
  if (!granted) {
    showVideoLibraryPermissionAlert();
  }
  return granted;
}

/** Brief pause so RN modals finish dismissing before the native Photos/Gallery picker opens. */
export function waitForModalDismiss(): Promise<void> {
  const delayMs = Platform.OS === 'ios' ? 450 : 300;
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

/**
 * When the user revokes PitchProof in iOS Settings → Apple ID → Sign in with Apple,
 * sign them out of Firebase so local session state stays consistent.
 */
export function useAppleCredentialRevokeListener(onRevoked: () => void): void {
  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }

    let subscription: ReturnType<typeof AppleAuthentication.addRevokeListener> | null = null;
    let cancelled = false;

    // The native module is absent in Expo Go and other runtimes without Apple
    // authentication; there the revoke listener simply cannot be registered.
    void AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (cancelled || !available) {
          return;
        }
        subscription = AppleAuthentication.addRevokeListener(() => {
          onRevoked();
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [onRevoked]);
}

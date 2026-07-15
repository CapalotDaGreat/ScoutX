import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

/**
 * When the user revokes ScoutX in iOS Settings → Apple ID → Sign in with Apple,
 * sign them out of Firebase so local session state stays consistent.
 */
export function useAppleCredentialRevokeListener(onRevoked: () => void): void {
  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }

    const subscription = AppleAuthentication.addRevokeListener(() => {
      onRevoked();
    });

    return () => {
      subscription.remove();
    };
  }, [onRevoked]);
}

import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

export function useAndroidBackHandler(enabled: boolean, onBack: () => boolean): void {
  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled) {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => subscription.remove();
  }, [enabled, onBack]);
}

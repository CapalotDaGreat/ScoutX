import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export async function triggerHaptic(
  type: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'light',
): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  switch (type) {
    case 'light':
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      break;
    case 'medium':
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      break;
    case 'heavy':
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      break;
    case 'success':
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      break;
    case 'error':
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      break;
  }
}

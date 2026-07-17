import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { registerForPushNotifications } from '@/features/notifications/services/pushNotificationService';

/**
 * Registers Expo push tokens for signed-in non-anonymous player and scout/coach sessions.
 */
export function usePushNotificationRegistration(enabled: boolean): void {
  const { user, role } = useAuth();

  useEffect(() => {
    const roleAllowed =
      role === 'player' || role === 'scout' || role === 'coach';

    if (
      Platform.OS === 'web' ||
      !enabled ||
      !user?.id ||
      !roleAllowed ||
      user.isAnonymous
    ) {
      return;
    }

    void registerForPushNotifications(user.id).catch(() => undefined);
  }, [enabled, role, user?.id, user?.isAnonymous]);
}

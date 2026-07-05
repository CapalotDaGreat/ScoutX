import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { registerForPushNotifications } from '@/features/notifications/services/pushNotificationService';

export function usePushNotificationRegistration(enabled: boolean): void {
  const { user, role } = useAuth();

  useEffect(() => {
    if (
      Platform.OS === 'web' ||
      !enabled ||
      !user?.id ||
      role !== 'player' ||
      user.isAnonymous
    ) {
      return;
    }

    void registerForPushNotifications(user.id).catch(() => undefined);
  }, [enabled, role, user?.id, user?.isAnonymous]);
}

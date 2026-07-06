import { useCallback, useEffect, useState } from 'react';
import { PushTokenRepository } from '@/features/notifications/repositories/PushTokenRepository';
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
} from '@/features/notifications/services/notificationPreferencesService';
import { registerForPushNotifications } from '@/features/notifications/services/pushNotificationService';

export function useNotificationPreferences(userId: string | undefined) {
  const [pushEnabled, setPushEnabled] = useState(true);
  const [hasToken, setHasToken] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(userId));
  const [isUpdating, setIsUpdating] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) {
      setPushEnabled(true);
      setHasToken(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [preferences, registered] = await Promise.all([
        loadNotificationPreferences(userId),
        PushTokenRepository.getInstance().hasRegisteredToken(userId),
      ]);
      setPushEnabled(preferences.pushEnabled);
      setHasToken(registered);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const enablePush = useCallback(async () => {
    if (!userId) {
      return false;
    }

    setIsUpdating(true);
    try {
      const registered = await registerForPushNotifications(userId);
      if (registered) {
        await saveNotificationPreferences(userId, { pushEnabled: true });
        setPushEnabled(true);
        setHasToken(true);
      }
      return registered;
    } finally {
      setIsUpdating(false);
    }
  }, [userId]);

  const disablePush = useCallback(async () => {
    if (!userId) {
      return;
    }

    setIsUpdating(true);
    try {
      await PushTokenRepository.getInstance().clearToken(userId);
      await saveNotificationPreferences(userId, { pushEnabled: false });
      setPushEnabled(false);
      setHasToken(false);
    } finally {
      setIsUpdating(false);
    }
  }, [userId]);

  const setPushPreference = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        await enablePush();
      } else {
        await disablePush();
      }
    },
    [disablePush, enablePush],
  );

  return {
    pushEnabled,
    hasToken,
    isLoading,
    isUpdating,
    enablePush,
    disablePush,
    setPushPreference,
    reload,
  };
}

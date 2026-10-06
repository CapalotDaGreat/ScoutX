import { useCallback, useEffect, useState } from 'react';
import { PushTokenRepository } from '@/features/notifications/repositories/PushTokenRepository';
import {
  defaultNotificationPreferences,
  loadNotificationPreferences,
  saveNotificationPreferences,
  type NotificationCategory,
  type NotificationPreferences,
} from '@/features/notifications/services/notificationPreferencesService';
import { registerForPushNotifications } from '@/features/notifications/services/pushNotificationService';

export function useNotificationPreferences(userId: string | undefined) {
  const [pushEnabled, setPushEnabled] = useState(true);
  const [categories, setCategories] = useState<NotificationPreferences['categories']>(
    defaultNotificationPreferences().categories,
  );
  const [hasToken, setHasToken] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(userId));
  const [isUpdating, setIsUpdating] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) {
      setPushEnabled(true);
      setCategories(defaultNotificationPreferences().categories);
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
      setCategories(preferences.categories);
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
        await saveNotificationPreferences(userId, {
          pushEnabled: true,
          categories,
        });
        setPushEnabled(true);
        setHasToken(true);
      }
      return registered;
    } finally {
      setIsUpdating(false);
    }
  }, [categories, userId]);

  const disablePush = useCallback(async () => {
    if (!userId) {
      return;
    }

    setIsUpdating(true);
    try {
      await PushTokenRepository.getInstance().clearToken(userId);
      await saveNotificationPreferences(userId, { pushEnabled: false, categories });
      setPushEnabled(false);
      setHasToken(false);
    } finally {
      setIsUpdating(false);
    }
  }, [categories, userId]);

  const setCategoryPreference = useCallback(
    async (category: NotificationCategory, enabled: boolean) => {
      if (!userId) {
        return;
      }
      const next = { ...categories, [category]: enabled };
      setCategories(next);
      await saveNotificationPreferences(userId, { pushEnabled, categories: next });
    },
    [categories, pushEnabled, userId],
  );

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
    categories,
    hasToken,
    isLoading,
    isUpdating,
    enablePush,
    disablePush,
    setPushPreference,
    setCategoryPreference,
    reload,
  };
}

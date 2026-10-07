import { useCallback, useEffect, useState } from 'react';
import { PushTokenRepository } from '@/features/notifications/repositories/PushTokenRepository';
import {
  defaultNotificationPreferences,
  loadNotificationPreferences,
  saveNotificationPreferences,
  type LockScreenPreview,
  type NotificationCategory,
  type NotificationPreferences,
} from '@/features/notifications/services/notificationPreferencesService';
import { registerForPushNotifications } from '@/features/notifications/services/pushNotificationService';

export function useNotificationPreferences(userId: string | undefined) {
  const [pushEnabled, setPushEnabled] = useState(true);
  const [categories, setCategories] = useState<NotificationPreferences['categories']>(
    defaultNotificationPreferences().categories,
  );
  const [lockScreenPreview, setLockScreenPreview] = useState<LockScreenPreview>('details');
  const [hasToken, setHasToken] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(userId));
  const [isUpdating, setIsUpdating] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) {
      setPushEnabled(true);
      setCategories(defaultNotificationPreferences().categories);
      setLockScreenPreview('details');
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
      setLockScreenPreview(preferences.lockScreenPreview);
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
          lockScreenPreview,
        });
        setPushEnabled(true);
        setHasToken(true);
      }
      return registered;
    } finally {
      setIsUpdating(false);
    }
  }, [categories, lockScreenPreview, userId]);

  const disablePush = useCallback(async () => {
    if (!userId) {
      return;
    }

    setIsUpdating(true);
    try {
      await PushTokenRepository.getInstance().clearToken(userId);
      await saveNotificationPreferences(userId, { pushEnabled: false, categories, lockScreenPreview });
      setPushEnabled(false);
      setHasToken(false);
    } finally {
      setIsUpdating(false);
    }
  }, [categories, lockScreenPreview, userId]);

  const setCategoryPreference = useCallback(
    async (category: NotificationCategory, enabled: boolean) => {
      if (!userId) {
        return;
      }
      const next = { ...categories, [category]: enabled };
      setCategories(next);
      await saveNotificationPreferences(userId, { pushEnabled, categories: next, lockScreenPreview });
    },
    [categories, lockScreenPreview, pushEnabled, userId],
  );

  const setLockScreenPreference = useCallback(
    async (preview: LockScreenPreview) => {
      if (!userId) {
        return;
      }
      setLockScreenPreview(preview);
      await saveNotificationPreferences(userId, { pushEnabled, categories, lockScreenPreview: preview });
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
    lockScreenPreview,
    hasToken,
    isLoading,
    isUpdating,
    enablePush,
    disablePush,
    setPushPreference,
    setCategoryPreference,
    setLockScreenPreference,
    reload,
  };
}

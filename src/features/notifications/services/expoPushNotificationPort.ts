import { Platform } from 'react-native';
import {
  type PushNotificationPayload,
  type PushNotificationPort,
  noopPushNotificationPort,
} from '@/features/activity-feed/services/pushNotificationPort';
import { registerForPushNotifications } from '@/features/notifications/services/pushNotificationService';
import { PushTokenRepository } from '@/features/notifications/repositories/PushTokenRepository';

function toPayload(raw: {
  request?: { content?: { title?: string | null; body?: string | null; data?: Record<string, unknown> } };
}): PushNotificationPayload {
  const content = raw.request?.content;
  const data = content?.data ?? {};
  const stringData: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      stringData[key] = value;
    }
  }

  return {
    title: content?.title?.trim() || 'PitchProof',
    body: content?.body?.trim() || '',
    data: stringData,
  };
}

/**
 * Expo Notifications-backed push port for ActivityProvider.
 * Falls back to no-op on web / when the native module is unavailable.
 */
export function createExpoPushNotificationPort(): PushNotificationPort {
  if (Platform.OS === 'web') {
    return noopPushNotificationPort;
  }

  return {
    registerDevice: async (userId: string) => {
      await registerForPushNotifications(userId);
    },
    unregisterDevice: async (userId: string) => {
      await PushTokenRepository.getInstance().clearToken(userId);
    },
    subscribe: (handler) => {
      let removeReceived: (() => void) | undefined;
      let removeResponse: (() => void) | undefined;
      let cancelled = false;

      void import('expo-notifications')
        .then((Notifications) => {
          if (cancelled) {
            return;
          }

          const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
            handler(toPayload(notification));
          });
          removeReceived = () => receivedSub.remove();

          const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
            handler(toPayload(response.notification));
          });
          removeResponse = () => responseSub.remove();
        })
        .catch(() => undefined);

      return () => {
        cancelled = true;
        removeReceived?.();
        removeResponse?.();
      };
    },
  };
}

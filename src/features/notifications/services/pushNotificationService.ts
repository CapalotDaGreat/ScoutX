import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { PushTokenRepository } from '@/features/notifications/repositories/PushTokenRepository';

type PermissionResult = {
  status: 'granted' | 'denied' | 'undetermined';
};

let notificationHandlerConfigured = false;

async function getNotificationsModule(): Promise<typeof import('expo-notifications') | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  return import('expo-notifications');
}

async function ensureNotificationHandler(): Promise<typeof import('expo-notifications') | null> {
  const Notifications = await getNotificationsModule();
  if (!Notifications || notificationHandlerConfigured) {
    return Notifications;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  notificationHandlerConfigured = true;
  return Notifications;
}

export async function registerForPushNotifications(userId: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  const Notifications = await ensureNotificationHandler();
  if (!Notifications) {
    return false;
  }

  if (!Device.isDevice) {
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'ScoutX',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const permissions = (await Notifications.getPermissionsAsync()) as PermissionResult;
  if (permissions.status !== 'granted') {
    const request = (await Notifications.requestPermissionsAsync()) as PermissionResult;
    if (request.status !== 'granted') {
      return false;
    }
  }

  const tokenResult = await Notifications.getExpoPushTokenAsync();
  const token = tokenResult.data;

  await PushTokenRepository.getInstance().saveToken(userId, token);
  return true;
}

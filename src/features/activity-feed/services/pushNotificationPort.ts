export type PushNotificationPayload = {
  messageId?: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type PushNotificationPort = {
  registerDevice: (userId: string) => Promise<void>;
  unregisterDevice: (userId: string) => Promise<void>;
  subscribe: (handler: (payload: PushNotificationPayload) => void) => () => void;
};

/** Default no-op port until Firebase Cloud Messaging is wired in. */
export const noopPushNotificationPort: PushNotificationPort = {
  registerDevice: async () => undefined,
  unregisterDevice: async () => undefined,
  subscribe: () => () => undefined,
};

export type ActivityPushBridge = {
  port: PushNotificationPort;
  ingestRemotePayload: (payload: PushNotificationPayload) => Promise<void>;
};

import type { ComponentType } from 'react';
import Constants from 'expo-constants';
import { isProductionApp } from '@/config/appMode';
import { scrubUnknownData } from '@/utils/scrubSensitiveData';

// Expo only inlines static process.env.EXPO_PUBLIC_* references (not env[key]).

function isSentryEnabled(): boolean {
  if (Constants.executionEnvironment === 'storeClient') {
    return false;
  }

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  return Boolean(dsn && isProductionApp());
}

function getSentryModule(): typeof import('@sentry/react-native') {
  // Lazy load — @sentry/react-native is not available in Expo Go.
  return require('@sentry/react-native') as typeof import('@sentry/react-native');
}

export function initSentry(): void {
  if (!isSentryEnabled()) {
    return;
  }

  const Sentry = getSentryModule();
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN!.trim(),
    enabled: true,
    sendDefaultPii: false,
    tracesSampleRate: 0.2,
    beforeSend(event) {
      if (event.request?.data) {
        event.request.data = scrubUnknownData(event.request.data) as typeof event.request.data;
      }

      if (event.extra) {
        event.extra = scrubUnknownData(event.extra) as typeof event.extra;
      }

      if (event.contexts) {
        event.contexts = scrubUnknownData(event.contexts) as typeof event.contexts;
      }

      return event;
    },
  });
}

export function wrapWithSentry<P extends Record<string, unknown>>(
  component: ComponentType<P>,
): ComponentType<P> {
  if (!isSentryEnabled()) {
    return component;
  }

  return getSentryModule().wrap(component) as ComponentType<P>;
}

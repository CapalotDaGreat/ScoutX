import * as Sentry from '@sentry/react-native';
import type { ComponentType } from 'react';
import { isProductionApp } from '@/config/appMode';

const env = process.env as Record<string, string | undefined>;

export function initSentry(): void {
  const dsn = env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn || !isProductionApp()) {
    return;
  }

  Sentry.init({
    dsn,
    enabled: true,
    tracesSampleRate: 0.2,
  });
}

export function wrapWithSentry<P extends Record<string, unknown>>(
  component: ComponentType<P>,
): ComponentType<P> {
  const dsn = env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn || !isProductionApp()) {
    return component;
  }

  return Sentry.wrap(component) as ComponentType<P>;
}

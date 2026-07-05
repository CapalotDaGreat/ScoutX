import { hasPrivacyPolicyUrl, hasTermsOfServiceUrl } from '@/config/legal';
import { isProductionApp } from '@/config/appMode';

const env = process.env as Record<string, string | undefined>;

export function isSentryConfigured(): boolean {
  const dsn = env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) {
    return false;
  }

  if (isProductionApp()) {
    return true;
  }

  return Boolean(dsn);
}

export function isStoreLegalConfigured(): boolean {
  return hasPrivacyPolicyUrl() && hasTermsOfServiceUrl();
}

export function isProductionMonitoringReady(): boolean {
  if (!isProductionApp()) {
    return true;
  }

  return isSentryConfigured();
}

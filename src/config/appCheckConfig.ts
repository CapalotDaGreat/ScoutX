import Constants from 'expo-constants';
import { isProductionApp } from '@/config/appMode';

export type AndroidAppCheckProviderName = 'debug' | 'playIntegrity';

export type AppleAppCheckProviderName =
  | 'debug'
  | 'deviceCheck'
  | 'appAttest'
  | 'appAttestWithDeviceCheckFallback';

export type WebAppCheckProviderName = 'debug' | 'reCaptchaV3';

export type AppCheckRuntimeConfig = {
  enabled: boolean;
  useDebugProvider: boolean;
  isExpoGo: boolean;
  android: {
    provider: AndroidAppCheckProviderName;
    debugToken?: string;
  };
  apple: {
    provider: AppleAppCheckProviderName;
    debugToken?: string;
  };
  web: {
    provider: WebAppCheckProviderName;
    recaptchaSiteKey?: string;
    debugToken?: string;
  };
};

// Expo only inlines static process.env.EXPO_PUBLIC_* references (not env[key]).
function trimEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function isAppCheckEnabled(): boolean {
  const flag = trimEnv(process.env.EXPO_PUBLIC_APP_CHECK_ENABLED);
  return flag !== 'false' && flag !== '0';
}

export function getAppCheckRuntimeConfig(): AppCheckRuntimeConfig {
  const explicitDebug = trimEnv(process.env.EXPO_PUBLIC_APP_CHECK_USE_DEBUG) === 'true';
  const useDebugProvider = explicitDebug || !isProductionApp();

  const androidDebugToken = trimEnv(process.env.EXPO_PUBLIC_APP_CHECK_ANDROID_DEBUG_TOKEN);
  const appleDebugToken = trimEnv(process.env.EXPO_PUBLIC_APP_CHECK_IOS_DEBUG_TOKEN);
  const webDebugToken = trimEnv(process.env.EXPO_PUBLIC_APP_CHECK_WEB_DEBUG_TOKEN);
  const recaptchaSiteKey = trimEnv(process.env.EXPO_PUBLIC_APP_CHECK_RECAPTCHA_SITE_KEY);

  return {
    enabled: isAppCheckEnabled(),
    useDebugProvider,
    isExpoGo: Constants.executionEnvironment === 'storeClient',
    android: {
      provider: useDebugProvider ? 'debug' : 'playIntegrity',
      debugToken: androidDebugToken,
    },
    apple: {
      provider: useDebugProvider ? 'debug' : 'appAttestWithDeviceCheckFallback',
      debugToken: appleDebugToken,
    },
    web: {
      provider: useDebugProvider ? 'debug' : 'reCaptchaV3',
      recaptchaSiteKey,
      debugToken: webDebugToken,
    },
  };
}

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { isProductionApp } from '@/config/appMode';
import {
  allowBundledDebugToken,
  appCheckConfigurationWarning,
  resolveAppCheckPolicy,
  type SimulatorContext,
} from '@/config/appCheckPolicy';

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
  /** Log-only explanation when this configuration cannot produce a token (see appCheckConfigurationWarning). */
  warning: string | null;
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
  return resolveAppCheckPolicy(isProductionApp(), process.env.EXPO_PUBLIC_APP_CHECK_ENABLED).enabled;
}

function simulatorContext(): SimulatorContext {
  return {
    flag: process.env.EXPO_PUBLIC_APP_CHECK_SIMULATOR_DEBUG,
    isPhysicalDevice: typeof Device.isDevice === 'boolean' ? Device.isDevice : null,
  };
}

export function getAppCheckRuntimeConfig(): AppCheckRuntimeConfig {
  const production = isProductionApp();
  const simulator = simulatorContext();
  const { useDebugProvider } = resolveAppCheckPolicy(production, undefined, simulator);
  const bundled = allowBundledDebugToken(production);

  const androidDebugToken = bundled ? trimEnv(process.env.EXPO_PUBLIC_APP_CHECK_ANDROID_DEBUG_TOKEN) : undefined;
  const appleDebugToken = bundled ? trimEnv(process.env.EXPO_PUBLIC_APP_CHECK_IOS_DEBUG_TOKEN) : undefined;
  const webDebugToken = bundled ? trimEnv(process.env.EXPO_PUBLIC_APP_CHECK_WEB_DEBUG_TOKEN) : undefined;
  const recaptchaSiteKey = trimEnv(process.env.EXPO_PUBLIC_APP_CHECK_RECAPTCHA_SITE_KEY);

  return {
    enabled: isAppCheckEnabled(),
    useDebugProvider,
    warning: appCheckConfigurationWarning(production, simulator),
    isExpoGo: Constants.executionEnvironment === 'storeClient',
    android: {
      provider: useDebugProvider ? 'debug' : 'playIntegrity',
      debugToken: useDebugProvider ? androidDebugToken : undefined,
    },
    apple: {
      provider: useDebugProvider ? 'debug' : 'appAttestWithDeviceCheckFallback',
      debugToken: useDebugProvider ? appleDebugToken : undefined,
    },
    web: {
      provider: useDebugProvider ? 'debug' : 'reCaptchaV3',
      recaptchaSiteKey,
      debugToken: useDebugProvider ? webDebugToken : undefined,
    },
  };
}

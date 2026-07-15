import { Platform } from 'react-native';
import type { FirebaseApp } from 'firebase/app';
import {
  CustomProvider,
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
} from 'firebase/app-check';
import { getAppCheckRuntimeConfig } from '@/config/appCheckConfig';

const APP_CHECK_TOKEN_TTL_MS = 55 * 60 * 1000;

type ReactNativeAppCheckModule = typeof import('@react-native-firebase/app-check');

async function loadReactNativeAppCheckModule(): Promise<ReactNativeAppCheckModule> {
  return import('@react-native-firebase/app-check');
}

let appCheckInstance: AppCheck | null = null;
let initializationPromise: Promise<AppCheck | null> | null = null;

function setWebDebugToken(debugToken?: string): void {
  if (typeof globalThis === 'undefined') {
    return;
  }

  const globalTarget = globalThis as typeof globalThis & {
    FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
  };

  globalTarget.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken ?? true;
}

function initializeWebAppCheck(app: FirebaseApp): AppCheck {
  const config = getAppCheckRuntimeConfig();

  if (config.web.provider === 'debug') {
    setWebDebugToken(config.web.debugToken);
    return initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider('00000000-0000-0000-0000-000000000000'),
      isTokenAutoRefreshEnabled: true,
    });
  }

  if (!config.web.recaptchaSiteKey) {
    throw new Error(
      'EXPO_PUBLIC_APP_CHECK_RECAPTCHA_SITE_KEY is required for web App Check in production.',
    );
  }

  return initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(config.web.recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

async function initializeNativeAppCheck(app: FirebaseApp): Promise<AppCheck> {
  const config = getAppCheckRuntimeConfig();
  const { default: appCheck, ReactNativeFirebaseAppCheckProvider } =
    await loadReactNativeAppCheckModule();
  const rnfbProvider = new ReactNativeFirebaseAppCheckProvider();

  rnfbProvider.configure({
    android: {
      provider: config.android.provider,
      ...(config.android.debugToken ? { debugToken: config.android.debugToken } : {}),
    },
    apple: {
      provider: config.apple.provider,
      ...(config.apple.debugToken ? { debugToken: config.apple.debugToken } : {}),
    },
    web: {
      provider: 'reCaptchaV3',
      siteKey: config.web.recaptchaSiteKey ?? 'unused-on-native',
    },
  });

  await appCheck().initializeAppCheck({
    provider: rnfbProvider,
    isTokenAutoRefreshEnabled: true,
  });

  const bridgeProvider = new CustomProvider({
    getToken: async () => {
      const result = await appCheck().getToken(false);
      return {
        token: result.token,
        expireTimeMillis: Date.now() + APP_CHECK_TOKEN_TTL_MS,
      };
    },
  });

  return initializeAppCheck(app, {
    provider: bridgeProvider,
    isTokenAutoRefreshEnabled: true,
  });
}

export async function initializeFirebaseAppCheck(app: FirebaseApp): Promise<AppCheck | null> {
  if (appCheckInstance) {
    return appCheckInstance;
  }

  if (!initializationPromise) {
    initializationPromise = (async () => {
      const config = getAppCheckRuntimeConfig();
      if (!config.enabled) {
        return null;
      }

      if (config.isExpoGo) {
        return null;
      }

      if (Platform.OS === 'web') {
        appCheckInstance = initializeWebAppCheck(app);
        return appCheckInstance;
      }

      if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
        return null;
      }

      appCheckInstance = await initializeNativeAppCheck(app);
      return appCheckInstance;
    })();
  }

  return initializationPromise;
}

export function isFirebaseAppCheckInitialized(): boolean {
  return appCheckInstance !== null;
}

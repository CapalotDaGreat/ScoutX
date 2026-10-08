import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ExpoConfig } from 'expo/config';
import appJson from './app.json';
import { missingRequiredLegalContacts } from './src/config/legalConfig.ts';

const baseConfig = appJson.expo as ExpoConfig;
const projectRoot = __dirname;

const isExpoGoDev = process.env.EXPO_PUBLIC_EXPO_GO === '1';

// EXPO_PUBLIC_* values are inlined into the JS bundle, so a client AI key would ship to every user.
if (
  process.env.EAS_BUILD_PROFILE === 'production' &&
  process.env.EXPO_PUBLIC_OPENROUTER_API_KEY?.trim()
) {
  throw new Error(
    'EXPO_PUBLIC_OPENROUTER_API_KEY must not be set for production builds; AI runs through Cloud Functions.',
  );
}
// RevenueCat Test Store keys complete purchases without the App Store; they must never reach users.
if (
  process.env.EAS_BUILD_PROFILE === 'production' &&
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY?.trim().startsWith('test_')
) {
  throw new Error(
    'EXPO_PUBLIC_REVENUECAT_IOS_KEY is a RevenueCat Test Store key; production builds need the App Store (appl_) key.',
  );
}
// Legal documents render LEGAL_CONTACT_REQUIRED for missing contacts; production must not ship that.
if (process.env.EAS_BUILD_PROFILE === 'production' && process.env.ALLOW_LEGAL_PLACEHOLDERS !== '1') {
  const missingContacts = missingRequiredLegalContacts();
  if (missingContacts.length > 0) {
    throw new Error(
      `Production build blocked: LEGAL_CONFIG is missing ${missingContacts.join(', ')} in src/config/legalConfig.ts. ` +
        'Set ALLOW_LEGAL_PLACEHOLDERS=1 only for internal test builds.',
    );
  }
}

const appLinkHost = process.env.EXPO_PUBLIC_APP_LINK_HOST?.trim() || 'pitchproof.online';
const googleServicesJson =
  process.env.GOOGLE_SERVICES_JSON?.trim() || './google-services.json';
const googleServicesPlist =
  process.env.GOOGLE_SERVICES_PLIST?.trim() || './GoogleService-Info.plist';

/** Mirrors src/config/googleAuth.ts — reverse iOS client ID when scheme env is omitted. */
function resolveGoogleIosUrlScheme(): string | null {
  const explicit = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME?.trim();
  if (explicit) {
    return explicit;
  }

  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const suffix = '.apps.googleusercontent.com';
  if (!iosClientId || !iosClientId.endsWith(suffix)) {
    return null;
  }

  const clientKey = iosClientId.slice(0, -suffix.length);
  return clientKey ? `com.googleusercontent.apps.${clientKey}` : null;
}

const googleIosUrlScheme = resolveGoogleIosUrlScheme();

function configFileExists(relativePath: string): boolean {
  return existsSync(resolve(projectRoot, relativePath));
}

const googleSignInPlugin: NonNullable<ExpoConfig['plugins']>[number] = googleIosUrlScheme
  ? [
      '@react-native-google-signin/google-signin',
      {
        iosUrlScheme: googleIosUrlScheme,
      },
    ]
  : '@react-native-google-signin/google-signin';

const plugins = [...(baseConfig.plugins ?? [])].filter((plugin) => {
  if (!isExpoGoDev) {
    return true;
  }

  const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
  // Match Trading_App: keep Expo Go free of native-only config plugins.
  return pluginName !== '@sentry/react-native/expo';
});

const requiredExpoPlugins = [
  'expo-asset',
  'expo-build-properties',
  'expo-font',
  'expo-localization',
  'expo-sharing',
  'expo-status-bar',
] as const;

for (const pluginName of requiredExpoPlugins) {
  const hasPlugin = plugins.some((plugin) =>
    plugin === pluginName || (Array.isArray(plugin) && plugin[0] === pluginName),
  );

  if (!hasPlugin) {
    plugins.push(pluginName);
  }
}

if (!isExpoGoDev) {
  const hasGooglePlugin = plugins.some((plugin) =>
    plugin === '@react-native-google-signin/google-signin' ||
    (Array.isArray(plugin) && plugin[0] === '@react-native-google-signin/google-signin'),
  );

  if (!hasGooglePlugin) {
    plugins.unshift(googleSignInPlugin);
  }

  const hasRnFirebaseAppPlugin = plugins.some((plugin) =>
    plugin === '@react-native-firebase/app' ||
    (Array.isArray(plugin) && plugin[0] === '@react-native-firebase/app'),
  );

  if (!hasRnFirebaseAppPlugin) {
    plugins.push('@react-native-firebase/app');
  }

  const hasRnFirebaseAppCheckPlugin = plugins.some((plugin) =>
    plugin === '@react-native-firebase/app-check' ||
    (Array.isArray(plugin) && plugin[0] === '@react-native-firebase/app-check'),
  );

  if (!hasRnFirebaseAppCheckPlugin) {
    plugins.push('@react-native-firebase/app-check');
  }

  const hasBuildPropertiesPlugin = plugins.some((plugin) =>
    plugin === 'expo-build-properties' ||
    (Array.isArray(plugin) && plugin[0] === 'expo-build-properties'),
  );

  if (!hasBuildPropertiesPlugin) {
    plugins.push([
      'expo-build-properties',
      {
        ios: {
          useFrameworks: 'static',
          forceStaticLinking: ['RNFBApp', 'RNFBAppCheck'],
        },
      },
    ]);
  }
}

const hasSecureStorePlugin = plugins.some((plugin) =>
  plugin === 'expo-secure-store' ||
  (Array.isArray(plugin) && plugin[0] === 'expo-secure-store'),
);

if (!hasSecureStorePlugin) {
  plugins.push([
    'expo-secure-store',
    {
      configureAndroidBackup: true,
      faceIDPermission:
        'Allow PitchProof to use Face ID when reading protected authentication data.',
    },
  ]);
}

const iosConfig: NonNullable<ExpoConfig['ios']> = {
  ...baseConfig.ios,
  associatedDomains: [
    `applinks:${appLinkHost}`,
    `applinks:www.${appLinkHost}`,
  ],
};

if (configFileExists(googleServicesPlist)) {
  iosConfig.googleServicesFile = googleServicesPlist;
}

const androidConfig: NonNullable<ExpoConfig['android']> = {
  ...baseConfig.android,
  intentFilters: [
    {
      action: 'VIEW',
      autoVerify: true,
      category: ['BROWSABLE', 'DEFAULT'],
      data: [
        {
          scheme: 'https',
          host: appLinkHost,
          pathPrefix: '/auth',
        },
        {
          scheme: 'https',
          host: `www.${appLinkHost}`,
          pathPrefix: '/auth',
        },
        {
          scheme: 'https',
          host: appLinkHost,
          pathPrefix: '/player',
        },
        {
          scheme: 'https',
          host: `www.${appLinkHost}`,
          pathPrefix: '/player',
        },
      ],
    },
  ],
};

if (configFileExists(googleServicesJson)) {
  androidConfig.googleServicesFile = googleServicesJson;
}

export default ({ config }: { config: ExpoConfig }): ExpoConfig => ({
  ...baseConfig,
  ...config,
  owner: 'boddibossi',
  plugins,
  ios: iosConfig,
  android: androidConfig,
  extra: {
    ...baseConfig.extra,
    appLinkHost,
    googleAuth: {
      iosUrlSchemeConfigured: Boolean(googleIosUrlScheme),
    },
    eas: {
      ...(typeof baseConfig.extra?.eas === 'object' && baseConfig.extra.eas !== null
        ? (baseConfig.extra.eas as Record<string, unknown>)
        : {}),
    },
  },
});

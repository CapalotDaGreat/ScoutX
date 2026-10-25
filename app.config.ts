import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ExpoConfig } from 'expo/config';
import appJson from './app.json';
import { missingRequiredLegalContacts } from './src/config/legalConfig.ts';
import { productionBuildProblems } from './src/config/releaseBuildPolicy.ts';
import { withFirebaseBuildProperties } from './src/config/nativeBuildPlugins.ts';

const baseConfig = appJson.expo as ExpoConfig;
const projectRoot = __dirname;

const isExpoGoDev = process.env.EXPO_PUBLIC_EXPO_GO === '1';

// Legal documents render LEGAL_CONTACT_REQUIRED for missing contacts; production must not ship that.
if (process.env.EAS_BUILD_PROFILE === 'production') {
  const missingContacts = missingRequiredLegalContacts();
  if (missingContacts.length > 0) {
    throw new Error(
      `Production build blocked: LEGAL_CONFIG is missing ${missingContacts.join(', ')} in src/config/legalConfig.ts.`,
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

let plugins = [...(baseConfig.plugins ?? [])].filter((plugin) => {
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

  plugins = withFirebaseBuildProperties(plugins);
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
  associatedDomains: [`applinks:${appLinkHost}`],
};

if (configFileExists(googleServicesPlist)) {
  iosConfig.googleServicesFile = googleServicesPlist;
}

if (process.env.EAS_BUILD_PROFILE === 'production') {
  const problems = productionBuildProblems(
    process.env, process.env.EAS_BUILD_PLATFORM ?? 'ios', configFileExists(googleServicesPlist),
  );
  if (problems.length > 0) {
    throw new Error(`Production build blocked:\n${problems.map((problem) => problem.message).join('\n')}`);
  }
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

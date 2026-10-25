import type { ExpoConfig } from 'expo/config';

type Plugins = NonNullable<ExpoConfig['plugins']>;

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

/** Firebase requires static frameworks even when build-properties was already registered. */
export function withFirebaseBuildProperties(plugins: Plugins): Plugins {
  const existing = plugins.find((plugin) =>
    Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
  );
  const options = record(Array.isArray(existing) ? existing[1] : undefined);
  const ios = record(options.ios);
  const staticPods = Array.isArray(ios.forceStaticLinking)
    ? ios.forceStaticLinking.filter((pod): pod is string => typeof pod === 'string') : [];
  const configured: Plugins[number] = ['expo-build-properties', {
    ...options,
    ios: {
      ...ios,
      useFrameworks: 'static',
      forceStaticLinking: [...new Set([...staticPods, 'RNFBApp', 'RNFBAppCheck'])],
    },
  }];
  return [...plugins.filter((plugin) =>
    plugin !== 'expo-build-properties' && !(Array.isArray(plugin) && plugin[0] === 'expo-build-properties'),
  ), configured];
}

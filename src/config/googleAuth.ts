/**
 * Google Sign-In / Google Identity Services client IDs for Firebase Authentication.
 *
 * Expo only inlines static process.env.EXPO_PUBLIC_* references (not env[key]).
 *
 * Architectural note (SDK 54):
 * Expo's maintained Google path is `@react-native-google-signin/google-signin`
 * (config plugin + development/EAS builds). The AuthSession Google provider is
 * deprecated / unmaintained — do not reintroduce expo-auth-session for Google.
 */

const GOOGLE_USERCONTENT_SUFFIX = '.apps.googleusercontent.com';

export function getGoogleWebClientId(): string | null {
  const value = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  return value || null;
}

export function getGoogleIosClientId(): string | null {
  const value = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  return value || null;
}

/**
 * iOS URL scheme required by the Google Sign-In config plugin.
 * Prefers EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME; otherwise derives the reversed
 * client ID from EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID (GIS recommendation).
 */
export function getGoogleIosUrlScheme(): string | null {
  const explicit = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME?.trim();
  if (explicit) {
    return explicit;
  }

  const iosClientId = getGoogleIosClientId();
  if (!iosClientId || !iosClientId.endsWith(GOOGLE_USERCONTENT_SUFFIX)) {
    return null;
  }

  const clientKey = iosClientId.slice(0, -GOOGLE_USERCONTENT_SUFFIX.length);
  if (!clientKey) {
    return null;
  }

  return `com.googleusercontent.apps.${clientKey}`;
}

export function isGoogleAuthConfigured(): boolean {
  return Boolean(getGoogleWebClientId());
}

export function getGoogleAuthConfigurationSummary(): {
  hasWebClientId: boolean;
  hasIosClientId: boolean;
  hasIosUrlScheme: boolean;
} {
  return {
    hasWebClientId: Boolean(getGoogleWebClientId()),
    hasIosClientId: Boolean(getGoogleIosClientId()),
    hasIosUrlScheme: Boolean(getGoogleIosUrlScheme()),
  };
}

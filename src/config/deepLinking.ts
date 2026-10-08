import * as Linking from 'expo-linking';
import type { ActionCodeSettings } from 'firebase/auth';
import Constants from 'expo-constants';

// Expo only inlines static process.env.EXPO_PUBLIC_* references (not env[key]).
const DEFAULT_APP_LINK_HOST = 'pitchproof.online';
const APP_SCHEME = 'scoutx';

export type FirebaseAuthActionMode =
  | 'verifyEmail'
  | 'resetPassword'
  | 'recoverEmail'
  | 'signIn'
  | 'revertSecondFactorAddition';

export type ParsedAuthActionLink = {
  mode: FirebaseAuthActionMode;
  oobCode: string;
  apiKey?: string;
  continueUrl?: string;
  lang?: string;
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getAppScheme(): string {
  return APP_SCHEME;
}

export function getAppLinkHost(): string {
  const configured = process.env.EXPO_PUBLIC_APP_LINK_HOST?.trim();
  if (configured) {
    return configured;
  }

  const projectId = getFirebaseProjectId();
  if (projectId) {
    // Prefer Firebase Hosting default domain until a custom universal-link host is owned.
    return `${projectId}.web.app`;
  }

  return DEFAULT_APP_LINK_HOST;
}

export function getFirebaseProjectId(): string | null {
  return process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim() || null;
}

export function getFirebaseAuthDomain(): string | null {
  return process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || null;
}

/**
 * Continue / custom email-action URL. Host this path (Firebase Hosting bridge)
 * so verification and reset links return into ScoutX with mode + oobCode.
 */
export function getAuthActionContinueUrl(): string {
  return `https://${getAppLinkHost()}/auth/action`;
}

export function getDeepLinkPrefixes(): string[] {
  const host = getAppLinkHost();
  const prefixes = new Set<string>([
    `${APP_SCHEME}://`,
    Linking.createURL('/'),
    `https://${host}`,
    `http://${host}`,
    `https://www.${host}`,
    `http://www.${host}`,
    'http://localhost:8081',
    'http://localhost:8082',
    'http://localhost:19006',
    'http://localhost:8090',
  ]);

  const authDomain = getFirebaseAuthDomain();
  if (authDomain) {
    prefixes.add(`https://${authDomain}`);
  }

  const projectId = getFirebaseProjectId();
  if (projectId) {
    prefixes.add(`https://${projectId}.firebaseapp.com`);
    prefixes.add(`https://${projectId}.web.app`);
  }

  return [...prefixes];
}

export function getFirebaseActionCodeSettings(): ActionCodeSettings {
  return {
    url: getAuthActionContinueUrl(),
    handleCodeInApp: true,
    iOS: {
      bundleId: Constants.expoConfig?.ios?.bundleIdentifier ?? 'com.scoutx.app',
    },
    android: {
      packageName: Constants.expoConfig?.android?.package ?? 'com.scoutx.app',
      installApp: true,
      minimumVersion: '1',
    },
  };
}

function isAuthActionPath(path: string | null | undefined): boolean {
  if (!path) {
    return false;
  }

  const normalized = path.replace(/^\/+/, '').replace(/\/+$/, '');
  return (
    normalized === 'auth/action' ||
    normalized === '__/auth/action' ||
    normalized.endsWith('/auth/action') ||
    normalized.endsWith('/__/auth/action')
  );
}

function isAuthActionMode(value: string): value is FirebaseAuthActionMode {
  return (
    value === 'verifyEmail' ||
    value === 'resetPassword' ||
    value === 'recoverEmail' ||
    value === 'signIn' ||
    value === 'revertSecondFactorAddition'
  );
}

function readQueryParam(
  queryParams: Linking.QueryParams | null | undefined,
  key: string,
): string | undefined {
  const value = queryParams?.[key];
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].length > 0) {
    return value[0];
  }
  return undefined;
}

function readSearchParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  return value && value.length > 0 ? value : undefined;
}

function buildParsedAuthAction(
  mode: string | undefined,
  oobCode: string | undefined,
  extras: {
    apiKey?: string;
    continueUrl?: string;
    lang?: string;
  } = {},
): ParsedAuthActionLink | null {
  if (!mode || !oobCode || !isAuthActionMode(mode)) {
    return null;
  }

  return {
    mode,
    oobCode,
    apiKey: extras.apiKey,
    continueUrl: extras.continueUrl,
    lang: extras.lang,
  };
}

function parseAuthActionFromSearchParams(params: URLSearchParams): ParsedAuthActionLink | null {
  const nestedLink = readSearchParam(params, 'link') ?? readSearchParam(params, 'deep_link_id');
  if (nestedLink) {
    try {
      const nested = parseAuthActionLink(decodeURIComponent(nestedLink));
      if (nested) {
        return nested;
      }
    } catch {
      // Fall through to top-level params.
    }
  }

  return buildParsedAuthAction(readSearchParam(params, 'mode'), readSearchParam(params, 'oobCode'), {
    apiKey: readSearchParam(params, 'apiKey'),
    continueUrl: readSearchParam(params, 'continueUrl'),
    lang: readSearchParam(params, 'lang'),
  });
}

/**
 * Parses Firebase email-action URLs from custom scheme, universal links,
 * Firebase auth domain (`__/auth/action`), and nested `link=` wrappers.
 */
export function parseAuthActionLink(url: string): ParsedAuthActionLink | null {
  const parsed = Linking.parse(url);
  const fromExpo = buildParsedAuthAction(
    readQueryParam(parsed.queryParams, 'mode'),
    readQueryParam(parsed.queryParams, 'oobCode'),
    {
      apiKey: readQueryParam(parsed.queryParams, 'apiKey'),
      continueUrl: readQueryParam(parsed.queryParams, 'continueUrl'),
      lang: readQueryParam(parsed.queryParams, 'lang'),
    },
  );

  if (fromExpo && isAuthActionPath(parsed.path)) {
    return fromExpo;
  }

  if (fromExpo && (!parsed.path || parsed.path === '' || parsed.hostname)) {
    // scoutx://auth/action?... can expose path differently across platforms.
    if (url.includes('auth/action') || url.includes('__/auth/action')) {
      return fromExpo;
    }
  }

  try {
    const withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) ? url : `https://${url}`;
    const absolute = new URL(withProtocol);
    const pathIsAction = isAuthActionPath(absolute.pathname);
    const fromUrl = parseAuthActionFromSearchParams(absolute.searchParams);

    if (fromUrl && (pathIsAction || absolute.searchParams.has('oobCode'))) {
      return fromUrl;
    }
  } catch {
    // Ignore malformed URLs — caller treats null as non-auth deep link.
  }

  return fromExpo && url.includes('oobCode=') ? fromExpo : null;
}

export function buildAuthActionDeepLink(action: ParsedAuthActionLink): string {
  const query = new URLSearchParams({
    mode: action.mode,
    oobCode: action.oobCode,
  });

  if (action.apiKey) {
    query.set('apiKey', action.apiKey);
  }
  if (action.continueUrl) {
    query.set('continueUrl', action.continueUrl);
  }
  if (action.lang) {
    query.set('lang', action.lang);
  }

  return `${APP_SCHEME}://auth/action?${query.toString()}`;
}

export function normalizeIncomingDeepLink(url: string): string {
  const authAction = parseAuthActionLink(url);
  if (authAction) {
    return buildAuthActionDeepLink(authAction);
  }

  return url;
}

export function buildAuthActionWebLink(action: ParsedAuthActionLink): string {
  const host = getAppLinkHost();
  const query = new URLSearchParams({
    mode: action.mode,
    oobCode: action.oobCode,
  });

  if (action.apiKey) {
    query.set('apiKey', action.apiKey);
  }

  return `${trimTrailingSlash(`https://${host}`)}/auth/action?${query.toString()}`;
}

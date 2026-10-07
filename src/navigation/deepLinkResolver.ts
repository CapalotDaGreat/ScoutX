/**
 * Pure deep-link gate shared by incoming URLs and push taps. Dependency-free so the unit
 * suite can import it directly.
 *
 * Auth, role and malformed-id states are decided here. Deleted, private and expired targets
 * can only be known after a read, so the destination screens render those states.
 */

export type DeepLinkRole = 'player' | 'scout' | 'coach' | 'guest' | null;

export type DeepLinkSession = {
  authenticated: boolean;
  role: DeepLinkRole;
};

export type DeepLinkUnavailableReason = 'wrong_role' | 'invalid' | 'not_found' | 'private' | 'expired';

export type DeepLinkResolution =
  /** Not a gated route; hand the path to the navigation config unchanged. */
  | { kind: 'passthrough'; path: string }
  /** Concrete in-app path for the current session. */
  | { kind: 'route'; path: string }
  /** Signed-out: stash `resumePath`, send the user to sign in, then resume. */
  | { kind: 'requires_auth'; resumePath: string }
  | { kind: 'unavailable'; reason: DeepLinkUnavailableReason };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidLinkId(value: string | undefined): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

/** Signed guardian tokens: base64url body and HMAC joined by one dot. */
const GUARDIAN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,2048}\.[A-Za-z0-9_-]{16,128}$/;

export function isGuardianToken(value: string | undefined): value is string {
  return typeof value === 'string' && GUARDIAN_TOKEN_PATTERN.test(value);
}

/** Push payload paths are server-built; still refuse anything that is not a plain app path. */
export function isValidPushPath(value: string): boolean {
  return /^[a-z][a-z0-9/_-]{0,200}$/i.test(value) && !value.includes('//');
}

export const LINK_UNAVAILABLE_PATH = 'link/unavailable';

export function unavailablePath(reason: DeepLinkUnavailableReason): string {
  return `${LINK_UNAVAILABLE_PATH}?reason=${reason}`;
}

/** Strips scheme/host/query and leading slashes: `scoutx://trial/abc?x=1` -> `trial/abc`. */
export function extractLinkPath(url: string, prefixes: readonly string[]): string {
  let rest = url;
  for (const prefix of [...prefixes].sort((a, b) => b.length - a.length)) {
    if (prefix && rest.startsWith(prefix)) {
      rest = rest.slice(prefix.length);
      break;
    }
  }
  const schemeMatch = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]*/.exec(rest);
  if (schemeMatch && rest === url) {
    rest = rest.slice(schemeMatch[0].length);
  }
  return rest.split(/[?#]/)[0].replace(/^\/+/, '').replace(/\/+$/, '');
}

function isScoutSide(role: DeepLinkRole): boolean {
  return role === 'scout' || role === 'coach';
}

function gated(
  path: string,
  session: DeepLinkSession,
  resolve: (role: DeepLinkRole) => DeepLinkResolution,
): DeepLinkResolution {
  if (!session.authenticated) {
    return { kind: 'requires_auth', resumePath: path };
  }
  return resolve(session.role);
}

export function resolveDeepLinkPath(rawPath: string, session: DeepLinkSession): DeepLinkResolution {
  const path = rawPath.replace(/^\/+/, '').replace(/\/+$/, '');
  const segments = path.split('/');
  const [head, first, second] = segments;

  switch (head) {
    case 'trial': {
      if (segments.length !== 2 || !isValidLinkId(first)) return { kind: 'unavailable', reason: 'invalid' };
      return gated(path, session, (role) => {
        if (role === 'player') return { kind: 'route', path: `player/trials?trialId=${first}` };
        if (isScoutSide(role)) return { kind: 'route', path: `scout/trials?trialId=${first}` };
        return { kind: 'unavailable', reason: 'wrong_role' };
      });
    }
    case 'request': {
      if (segments.length !== 2 || !isValidLinkId(first)) return { kind: 'unavailable', reason: 'invalid' };
      return gated(path, session, (role) =>
        role === 'player'
          ? { kind: 'route', path: `player/requests?requestId=${first}` }
          : { kind: 'unavailable', reason: 'wrong_role' },
      );
    }
    case 'reel': {
      if (segments.length !== 2 || !isValidLinkId(first)) return { kind: 'unavailable', reason: 'invalid' };
      return gated(path, session, (role) =>
        role === 'player'
          ? { kind: 'route', path: `player/media?reelId=${first}` }
          : { kind: 'unavailable', reason: 'wrong_role' },
      );
    }
    case 'evidence': {
      if (segments.length !== 3 || !isValidLinkId(first) || !isValidLinkId(second)) {
        return { kind: 'unavailable', reason: 'invalid' };
      }
      return gated(path, session, (role) => {
        if (isScoutSide(role)) {
          return { kind: 'route', path: `scout/player/${first}?evidenceId=${second}` };
        }
        if (role === 'player') {
          return { kind: 'route', path: `player/detail/${first}?evidenceId=${second}` };
        }
        return { kind: 'route', path: `guest/player/${first}` };
      });
    }
    case 'match': {
      if (segments.length !== 2 || !isValidLinkId(first)) return { kind: 'unavailable', reason: 'invalid' };
      return gated(path, session, (role) =>
        role === 'player'
          ? { kind: 'route', path: `match/${first}` }
          : { kind: 'unavailable', reason: 'wrong_role' },
      );
    }
    case 'guardian': {
      // Guardian review never happens inside the child's session; the screen hands off to the
      // hosted page, so no sign-in or role is required.
      if (segments.length !== 2 || !isGuardianToken(first)) return { kind: 'unavailable', reason: 'invalid' };
      return { kind: 'route', path: `link/guardian/${first}` };
    }
    case 'report': {
      if (segments.length !== 3 || !isValidLinkId(first) || !isValidLinkId(second)) {
        return { kind: 'unavailable', reason: 'invalid' };
      }
      return gated(path, session, () => ({ kind: 'route', path: `link/report/${first}/${second}` }));
    }
    default:
      return { kind: 'passthrough', path };
  }
}

/** Turns a resolution into the path handed to the navigation config. */
export function resolutionToPath(resolution: DeepLinkResolution): string {
  switch (resolution.kind) {
    case 'passthrough':
    case 'route':
      return resolution.path;
    case 'requires_auth':
      return 'login';
    case 'unavailable':
      return unavailablePath(resolution.reason);
  }
}

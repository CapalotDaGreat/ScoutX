const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;
const RESERVED_USERNAMES = new Set([
  'admin',
  'api',
  'app',
  'coach',
  'guest',
  'login',
  'player',
  'career',
  'stats',
  'gps',
  'trials',
  'portfolio',
  'register',
  'scout',
  'scoutx',
  'www',
]);

export function slugifyUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

export function suggestUsernameFromName(fullName: string): string {
  const base = slugifyUsername(fullName);
  if (base.length >= 3) {
    return base;
  }
  return `player-${Date.now().toString(36).slice(-4)}`;
}

export function validateUsername(username: string): string | null {
  const normalized = slugifyUsername(username);
  if (normalized.length < 3) {
    return 'Username must be at least 3 characters.';
  }
  if (normalized.length > 30) {
    return 'Username must be 30 characters or fewer.';
  }
  if (!USERNAME_PATTERN.test(normalized)) {
    return 'Use lowercase letters, numbers, and hyphens only.';
  }
  if (RESERVED_USERNAMES.has(normalized)) {
    return 'This username is reserved.';
  }
  return null;
}

export function isLikelyFirebaseUid(value: string): boolean {
  return value.length >= 20 && !value.includes('-');
}

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(slugifyUsername(username));
}

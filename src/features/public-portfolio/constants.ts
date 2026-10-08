export const PUBLIC_PORTFOLIO_PATH_PREFIX = 'https://pitchproof.online/player';

export function buildPublicPortfolioUrl(playerId: string, username?: string | null): string {
  if (username && username.length >= 3) {
    return `${PUBLIC_PORTFOLIO_PATH_PREFIX}/${username}`;
  }
  return `${PUBLIC_PORTFOLIO_PATH_PREFIX}/${playerId}`;
}

export function buildPublicPortfolioDeepLink(playerId: string, username?: string | null): string {
  if (username && username.length >= 3) {
    return `scoutx://player/${username}`;
  }
  return `scoutx://portfolio/${playerId}`;
}

export function buildCoachEndorsementInviteUrl(playerId: string, username?: string | null): string {
  const base = buildPublicPortfolioUrl(playerId, username);
  return `${base}?endorse=1`;
}

export const ENDORSEMENT_CATEGORIES = [
  'Technical',
  'Tactical',
  'Physical',
  'Mental',
  'Leadership',
  'Professionalism',
] as const;

export type EndorsementCategory = (typeof ENDORSEMENT_CATEGORIES)[number];

export const PUBLIC_PORTFOLIO_PATH_PREFIX = 'https://scoutx.app/portfolio';

export function buildPublicPortfolioUrl(playerId: string): string {
  return `${PUBLIC_PORTFOLIO_PATH_PREFIX}/${playerId}`;
}

export function buildPublicPortfolioDeepLink(playerId: string): string {
  return `scoutx://portfolio/${playerId}`;
}

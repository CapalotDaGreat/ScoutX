import { type DiscoverablePlayer, type DiscoverySearchScope } from '@/features/scout-discovery/types';
import { indexedSearchMatches } from './discoverySearchIndex';

export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function searchFields(player: DiscoverablePlayer, scope: DiscoverySearchScope): string[] {
  const fields = {
    name: [player.fullName, player.username ?? ''],
    club: [player.club],
    position: player.position,
    nationality: [player.nationality],
    league: [player.league],
  };
  return (scope === 'all' ? [...Object.values(fields).flat(), ...player.searchKeywords] : fields[scope])
    .map(normalizeSearch);
}

export function matchesPlayerSearch(player: DiscoverablePlayer, query: string, scope: DiscoverySearchScope): boolean {
  return indexedSearchMatches(player, query, scope);
}

export type SearchRelevanceScore = {
  playerId: string;
  score: number;
  reasons: string[];
};

function tokenize(query: string): string[] {
  return normalizeSearch(query)
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function scoreTokenMatch(keywords: string[], token: string): number {
  let best = 0;
  for (const keyword of keywords) {
    if (keyword === token) {
      best = Math.max(best, 100);
    } else if (keyword.startsWith(token)) {
      best = Math.max(best, 80);
    } else if (keyword.includes(token)) {
      best = Math.max(best, 50);
    }
  }
  return best;
}

export function scorePlayerSearchRelevance(
  player: DiscoverablePlayer,
  query: string,
  scope: DiscoverySearchScope = 'all',
): SearchRelevanceScore {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return { playerId: player.id, score: 0, reasons: [] };
  }

  let score = 0;
  const reasons: string[] = [];
  if (!matchesPlayerSearch(player, query, scope)) {
    return { playerId: player.id, score: 0, reasons };
  }

  for (const token of tokens) {
    const tokenScore = scoreTokenMatch(searchFields(player, scope), token);
    score += tokenScore;

    if ((scope === 'all' || scope === 'name') && normalizeSearch(player.username ?? '') === token) {
      score += 120;
      reasons.push('Exact username match');
    }
    if ((scope === 'all' || scope === 'name') && normalizeSearch(player.fullName).includes(token)) {
      reasons.push('Name match');
    }
    if ((scope === 'all' || scope === 'position') && player.position.some((position) => normalizeSearch(position) === token)) {
      score += 40;
      reasons.push('Position match');
    }
    if ((scope === 'all' || scope === 'club') && normalizeSearch(player.club).includes(token)) {
      score += 30;
      reasons.push('Club match');
    }
  }

  if (player.verified) {
    score += 25;
    reasons.push('Verified player');
  }
  if (player.recentlyActive) {
    score += 20;
    reasons.push('Recently active');
  }
  if (player.hasHighlightVideos) {
    score += 15;
    reasons.push('Has highlight videos');
  }

  score += Math.min(20, player.viewCount / 5);

  return { playerId: player.id, score, reasons: [...new Set(reasons)] };
}

export function rankPlayersBySearchRelevance(
  players: DiscoverablePlayer[],
  query: string,
  scope: DiscoverySearchScope = 'all',
): DiscoverablePlayer[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return players;
  }

  const scored = players.filter((player) => matchesPlayerSearch(player, query, scope)).map((player) => ({
    player,
    relevance: scorePlayerSearchRelevance(player, trimmed, scope),
  }));

  scored.sort((a, b) => {
    if (b.relevance.score !== a.relevance.score) {
      return b.relevance.score - a.relevance.score;
    }
    return a.player.id.localeCompare(b.player.id);
  });

  return scored.map((item) => item.player);
}

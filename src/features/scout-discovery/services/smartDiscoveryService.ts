import { type DiscoverablePlayer } from '@/features/scout-discovery/types';

export type SearchRelevanceScore = {
  playerId: string;
  score: number;
  reasons: string[];
};

function tokenize(query: string): string[] {
  return query
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
): SearchRelevanceScore {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return { playerId: player.id, score: 0, reasons: [] };
  }

  let score = 0;
  const reasons: string[] = [];

  for (const token of tokens) {
    const tokenScore = scoreTokenMatch(player.searchKeywords, token);
    score += tokenScore;

    if (player.username?.toLowerCase() === token) {
      score += 120;
      reasons.push('Exact username match');
    }
    if (player.fullName.toLowerCase().includes(token)) {
      reasons.push('Name match');
    }
    if (player.position.some((position) => position.toLowerCase() === token)) {
      score += 40;
      reasons.push('Position match');
    }
    if (player.club.toLowerCase().includes(token)) {
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
): DiscoverablePlayer[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return players;
  }

  const scored = players.map((player) => ({
    player,
    relevance: scorePlayerSearchRelevance(player, trimmed),
  }));

  scored.sort((a, b) => {
    if (b.relevance.score !== a.relevance.score) {
      return b.relevance.score - a.relevance.score;
    }
    return b.player.overallRating - a.player.overallRating;
  });

  return scored.map((item) => item.player);
}

export function buildSearchSuggestions(
  players: DiscoverablePlayer[],
  query: string,
  limit = 6,
): string[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return [];
  }

  const suggestions = new Set<string>();

  for (const player of players) {
    if (player.fullName.toLowerCase().includes(trimmed)) {
      suggestions.add(player.fullName);
    }
    if (player.username?.toLowerCase().includes(trimmed)) {
      suggestions.add(`@${player.username}`);
    }
    if (player.club.toLowerCase().includes(trimmed)) {
      suggestions.add(player.club);
    }
    for (const position of player.position) {
      if (position.toLowerCase().includes(trimmed)) {
        suggestions.add(position);
      }
    }
    if (suggestions.size >= limit) {
      break;
    }
  }

  return [...suggestions].slice(0, limit);
}

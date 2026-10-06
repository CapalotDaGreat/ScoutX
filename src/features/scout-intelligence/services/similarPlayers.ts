import type { DiscoverablePlayer } from '@/features/scout-discovery/types';
import type { SimilarPlayerScore } from '@/features/scout-intelligence/types';

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) {
    return 0;
  }
  const left = new Set(a.map((item) => item.toLowerCase()));
  const right = new Set(b.map((item) => item.toLowerCase()));
  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) {
      intersection += 1;
    }
  }
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Similarity is overlap of recorded attributes only. Ratings, potential, and
 * invented chemistry scores are not used.
 */
export function scoreSimilarPlayer(
  seed: DiscoverablePlayer,
  candidate: DiscoverablePlayer,
): SimilarPlayerScore | null {
  if (seed.id === candidate.id) {
    return null;
  }

  const sharedPositions = seed.position.filter((position) => candidate.position.includes(position));
  const sharedStyleTags = seed.styleTags.filter((tag) =>
    candidate.styleTags.some((other) => other.toLowerCase() === tag.toLowerCase()),
  );
  const sameClub = Boolean(seed.club) && seed.club === candidate.club && seed.club !== 'Free Agent';
  const sameLeague = Boolean(seed.league) && seed.league === candidate.league && seed.league !== 'Amateur';

  const overlap =
    jaccard(seed.position, candidate.position) * 0.5 +
    jaccard(seed.styleTags, candidate.styleTags) * 0.3 +
    (sameClub ? 0.12 : 0) +
    (sameLeague ? 0.08 : 0);

  if (overlap <= 0) {
    return null;
  }

  return {
    playerId: candidate.id,
    overlap,
    sharedPositions,
    sharedStyleTags,
    sameClub,
    sameLeague,
  };
}

export function rankSimilarPlayers(
  seed: DiscoverablePlayer,
  pool: DiscoverablePlayer[],
  limit = 5,
): SimilarPlayerScore[] {
  return pool
    .map((candidate) => scoreSimilarPlayer(seed, candidate))
    .filter((score): score is SimilarPlayerScore => score !== null)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, limit);
}

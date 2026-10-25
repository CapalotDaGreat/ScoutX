import {
  type DiscoverablePlayer,
  type DiscoveryFilters,
  type DiscoveryQuery,
  type DiscoveryPageResult,
  type DiscoverySortOption,
} from '@/features/scout-discovery/types';
import { matchesPlayerSearch } from '@/features/scout-discovery/services/smartDiscoveryService';
import { publicEvidenceRank } from './discoverySearchIndex';
import {
  matchesRole,
  meetsEvidenceCoverage,
  meetsEvidenceFreshness,
} from '@/features/scout-intelligence/services/briefMatch';

export function paginateDiscoveryPlayers(
  players: DiscoverablePlayer[], cursor: string | null, pageSize: number,
): DiscoveryPageResult {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 40) {
    throw new Error('Invalid discovery page size.');
  }
  const index = cursor === null ? -1 : players.findIndex((player) => player.id === cursor);
  if (cursor !== null && index < 0) throw new Error('Discovery cursor is stale; restart search.');
  const page = players.slice(index + 1, index + 1 + pageSize);
  const hasMore = index + 1 + page.length < players.length;
  return { players: page, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null, hasMore };
}

/**
 * A minimum/maximum filter can only be satisfied by a known value. Unknown values are
 * excluded when the scout explicitly filters on that dimension.
 */
function meetsMin(value: number | null, min: number | null): boolean {
  return min === null || (value !== null && value >= min);
}

function meetsMax(value: number | null, max: number | null): boolean {
  return max === null || (value !== null && value <= max);
}

/** Sort helper: known values first (per direction), unknown values last. */
function compareNullable(a: number | null, b: number | null, direction: 'asc' | 'desc'): number {
  a = a !== null && Number.isFinite(a) ? a : null;
  b = b !== null && Number.isFinite(b) ? b : null;
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === 'desc' ? b - a : a - b;
}

function matchesFilters(player: DiscoverablePlayer, filters: DiscoveryFilters): boolean {
  if (!meetsMin(player.age, filters.ageMin)) return false;
  if (!meetsMax(player.age, filters.ageMax)) return false;
  if (filters.positions.length > 0 && !filters.positions.some((p) => player.position.includes(p))) {
    return false;
  }
  if (filters.nationalities.length > 0 && !filters.nationalities.includes(player.nationality)) {
    return false;
  }
  if (filters.preferredFoot && player.preferredFoot !== filters.preferredFoot) return false;
  if (!meetsMin(player.heightCm, filters.heightMin)) return false;
  if (!meetsMax(player.heightCm, filters.heightMax)) return false;
  if (!meetsMin(player.weightKg, filters.weightMin)) return false;
  if (!meetsMax(player.weightKg, filters.weightMax)) return false;
  if (filters.clubs.length > 0 && !filters.clubs.includes(player.club)) return false;
  if (filters.leagues.length > 0 && !filters.leagues.includes(player.league)) return false;
  if (filters.availability && player.availability !== filters.availability) return false;
  if (!meetsMin(player.overallRating, filters.overallMin)) return false;
  if (!meetsMin(player.potentialRating, filters.potentialMin)) return false;
  if (
    filters.distanceMaxKm !== null &&
    (player.distanceKm === null || player.distanceKm > filters.distanceMaxKm)
  ) {
    return false;
  }
  if (!meetsMin(player.sprintSpeedKmh, filters.sprintSpeedMin)) return false;
  if (!meetsMin(player.ratings.passing, filters.passingMin)) return false;
  if (!meetsMin(player.ratings.shooting, filters.shootingMin)) return false;
  if (!meetsMin(player.ratings.defending, filters.defendingMin)) return false;
  if (!meetsMin(player.ratings.physical, filters.physicalMin)) return false;
  if (!meetsMin(player.weakFoot, filters.weakFootMin)) return false;
  if (!meetsMin(player.skillMoves, filters.skillMovesMin)) return false;
  if (filters.matchCountMin !== null && player.matchCount < filters.matchCountMin) return false;
  if (filters.recentlyActive && !player.recentlyActive) return false;
  if (filters.hasHighlightVideos && !player.hasHighlightVideos) return false;
  if (filters.verifiedOnly && !player.verified) return false;
  if (filters.roles.length > 0 && !matchesRole(player, filters.roles)) return false;
  if (!meetsEvidenceCoverage(player.evidenceCoverage, filters.minEvidenceCoverage)) return false;
  if (!meetsEvidenceFreshness(player.lastEvidenceAt, filters.evidenceMaxAgeDays)) return false;

  return true;
}

export function filterAndSortPlayers(
  players: DiscoverablePlayer[],
  query: DiscoveryQuery,
): DiscoverablePlayer[] {
  const scope = query.searchScope ?? 'all';
  const filtered = players.filter(
    (player) =>
      matchesPlayerSearch(player, query.search, scope) && matchesFilters(player, query.filters),
  );

  return sortPlayers(filtered, query.sort);
}

/**
 * Legacy sort values persisted in old presets/workspaces. Overall/potential are not
 * PitchProof grades (server projections write null), so they fall back to recency
 * instead of ranking players by an invented composite.
 */
export function normalizeDiscoverySort(sort: DiscoverySortOption): DiscoverySortOption {
  return sort === 'overall' || sort === 'potential' || sort === 'newest' ? 'recently_updated' : sort;
}

export function sortPlayers(
  players: DiscoverablePlayer[],
  sort: DiscoverySortOption,
): DiscoverablePlayer[] {
  const sorted = [...players];
  const effectiveSort = normalizeDiscoverySort(sort);

  const compare = (a: DiscoverablePlayer, b: DiscoverablePlayer): number => {
    switch (effectiveSort) {
      case 'relevance':
        return publicEvidenceRank(b) - publicEvidenceRank(a);
      case 'age':
        return compareNullable(a.age, b.age, 'asc');
      case 'name':
        return a.fullName.localeCompare(b.fullName);
      case 'distance':
        return compareNullable(a.distanceKm, b.distanceKm, 'asc');
      case 'recently_updated':
        return compareNullable(Date.parse(a.updatedAt), Date.parse(b.updatedAt), 'desc');
      case 'most_viewed':
        return b.viewCount - a.viewCount;
      case 'sprint_speed':
        return compareNullable(a.sprintSpeedKmh, b.sprintSpeedKmh, 'desc');
      case 'weak_foot':
        return compareNullable(a.weakFoot, b.weakFoot, 'desc');
      case 'skill_moves':
        return compareNullable(a.skillMoves, b.skillMoves, 'desc');
      case 'goals':
        return b.goals - a.goals;
      case 'assists':
        return b.assists - a.assists;
      default:
        return 0;
    }
  };
  sorted.sort((a, b) => compare(a, b) || a.id.localeCompare(b.id));

  return sorted;
}

export function countActiveFilters(filters: DiscoveryFilters): number {
  let count = 0;
  if (filters.ageMin !== null || filters.ageMax !== null) count += 1;
  if (filters.positions.length > 0) count += 1;
  if (filters.nationalities.length > 0) count += 1;
  if (filters.preferredFoot) count += 1;
  if (filters.heightMin !== null || filters.heightMax !== null) count += 1;
  if (filters.weightMin !== null || filters.weightMax !== null) count += 1;
  if (filters.clubs.length > 0) count += 1;
  if (filters.leagues.length > 0) count += 1;
  if (filters.availability) count += 1;
  if (filters.overallMin !== null) count += 1;
  if (filters.potentialMin !== null) count += 1;
  if (filters.distanceMaxKm !== null) count += 1;
  if (filters.sprintSpeedMin !== null) count += 1;
  if (filters.passingMin !== null) count += 1;
  if (filters.shootingMin !== null) count += 1;
  if (filters.defendingMin !== null) count += 1;
  if (filters.physicalMin !== null) count += 1;
  if (filters.weakFootMin !== null) count += 1;
  if (filters.skillMovesMin !== null) count += 1;
  if (filters.matchCountMin !== null) count += 1;
  if (filters.recentlyActive) count += 1;
  if (filters.hasHighlightVideos) count += 1;
  if (filters.verifiedOnly) count += 1;
  if (filters.roles.length > 0) count += 1;
  if (filters.minEvidenceCoverage !== null) count += 1;
  if (filters.evidenceMaxAgeDays !== null) count += 1;
  return count;
}

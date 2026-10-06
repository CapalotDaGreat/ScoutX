import {
  type DiscoverablePlayer,
  type DiscoveryFilters,
  type DiscoveryQuery,
  type DiscoverySearchScope,
  type DiscoverySortOption,
} from '@/features/scout-discovery/types';
import { rankPlayersBySearchRelevance } from '@/features/scout-discovery/services/smartDiscoveryService';

function matchesScopedField(value: string, query: string): boolean {
  return value.toLowerCase().includes(query);
}

function matchesSearch(
  player: DiscoverablePlayer,
  search: string,
  scope: DiscoverySearchScope = 'all',
): boolean {
  const query = search.trim().toLowerCase();
  if (!query) {
    return true;
  }

  switch (scope) {
    case 'name':
      return (
        matchesScopedField(player.fullName, query) ||
        Boolean(player.username && matchesScopedField(player.username, query))
      );
    case 'club':
      return matchesScopedField(player.club, query);
    case 'position':
      return player.position.some((position) => matchesScopedField(position, query));
    case 'nationality':
      return matchesScopedField(player.nationality, query);
    case 'league':
      return matchesScopedField(player.league, query);
    case 'all':
    default:
      return player.searchKeywords.some((keyword) => keyword.includes(query));
  }
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

  return true;
}

export function filterAndSortPlayers(
  players: DiscoverablePlayer[],
  query: DiscoveryQuery,
): DiscoverablePlayer[] {
  const scope = query.searchScope ?? 'all';
  const filtered = players.filter(
    (player) =>
      matchesSearch(player, query.search, scope) && matchesFilters(player, query.filters),
  );

  if (query.search.trim() && query.sort === 'relevance') {
    return rankPlayersBySearchRelevance(filtered, query.search);
  }

  return sortPlayers(filtered, query.sort);
}

export function sortPlayers(
  players: DiscoverablePlayer[],
  sort: DiscoverySortOption,
): DiscoverablePlayer[] {
  const sorted = [...players];

  sorted.sort((a, b) => {
    switch (sort) {
      case 'overall':
        return compareNullable(a.overallRating, b.overallRating, 'desc');
      case 'potential':
        return compareNullable(a.potentialRating, b.potentialRating, 'desc');
      case 'age':
        return compareNullable(a.age, b.age, 'asc');
      case 'name':
        return a.fullName.localeCompare(b.fullName);
      case 'distance':
        return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
      case 'recently_updated':
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
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
      case 'newest':
        return a.id.localeCompare(b.id);
      default:
        return 0;
    }
  });

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
  return count;
}

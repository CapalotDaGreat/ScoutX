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

function matchesFilters(player: DiscoverablePlayer, filters: DiscoveryFilters): boolean {
  if (filters.ageMin !== null && player.age < filters.ageMin) return false;
  if (filters.ageMax !== null && player.age > filters.ageMax) return false;
  if (filters.positions.length > 0 && !filters.positions.some((p) => player.position.includes(p))) {
    return false;
  }
  if (filters.nationalities.length > 0 && !filters.nationalities.includes(player.nationality)) {
    return false;
  }
  if (filters.preferredFoot && player.preferredFoot !== filters.preferredFoot) return false;
  if (filters.heightMin !== null && player.heightCm < filters.heightMin) return false;
  if (filters.heightMax !== null && player.heightCm > filters.heightMax) return false;
  if (filters.weightMin !== null && player.weightKg < filters.weightMin) return false;
  if (filters.weightMax !== null && player.weightKg > filters.weightMax) return false;
  if (filters.clubs.length > 0 && !filters.clubs.includes(player.club)) return false;
  if (filters.leagues.length > 0 && !filters.leagues.includes(player.league)) return false;
  if (filters.availability && player.availability !== filters.availability) return false;
  if (filters.overallMin !== null && player.overallRating < filters.overallMin) return false;
  if (filters.potentialMin !== null && player.potentialRating < filters.potentialMin) return false;
  if (
    filters.distanceMaxKm !== null &&
    (player.distanceKm === null || player.distanceKm > filters.distanceMaxKm)
  ) {
    return false;
  }
  if (filters.sprintSpeedMin !== null && player.sprintSpeedKmh < filters.sprintSpeedMin) return false;
  if (filters.passingMin !== null && player.ratings.passing < filters.passingMin) return false;
  if (filters.shootingMin !== null && player.ratings.shooting < filters.shootingMin) return false;
  if (filters.defendingMin !== null && player.ratings.defending < filters.defendingMin) return false;
  if (filters.physicalMin !== null && player.ratings.physical < filters.physicalMin) return false;
  if (filters.weakFootMin !== null && player.weakFoot < filters.weakFootMin) return false;
  if (filters.skillMovesMin !== null && player.skillMoves < filters.skillMovesMin) return false;
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
        return b.overallRating - a.overallRating;
      case 'potential':
        return b.potentialRating - a.potentialRating;
      case 'age':
        return a.age - b.age;
      case 'name':
        return a.fullName.localeCompare(b.fullName);
      case 'distance':
        return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
      case 'recently_updated':
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      case 'most_viewed':
        return b.viewCount - a.viewCount;
      case 'sprint_speed':
        return b.sprintSpeedKmh - a.sprintSpeedKmh;
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

import {
  defaultDiscoveryFilters,
  type DiscoverySearchScope,
  type DiscoverySortOption,
  type FilterPreset,
  type PlayerPosition,
} from '@/features/scout-discovery/types';

export const DISCOVERY_PAGE_SIZE = 12;

export const SEARCH_SCOPE_OPTIONS: DiscoverySearchScope[] = [
  'all',
  'name',
  'club',
  'position',
  'nationality',
  'league',
];

export const SORT_OPTIONS: DiscoverySortOption[] = [
  'relevance',
  'overall',
  'potential',
  'age',
  'name',
  'distance',
  'recently_updated',
  'most_viewed',
  'sprint_speed',
  'weak_foot',
  'skill_moves',
  'goals',
  'assists',
  'newest',
];

export const POSITION_OPTIONS: PlayerPosition[] = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'CF'];

export const NATIONALITY_OPTIONS = [
  'Brazil',
  'England',
  'France',
  'Germany',
  'Netherlands',
  'Nigeria',
  'Portugal',
  'Spain',
  'Switzerland',
  'USA',
];

export const LEAGUE_OPTIONS = [
  'Premier League',
  'La Liga',
  'Bundesliga',
  'Serie A',
  'Ligue 1',
  'Eredivisie',
  'MLS',
  'Swiss Super League',
];

export const CLUB_OPTIONS = [
  'Ajax',
  'Bayern Munich',
  'Borussia Dortmund',
  'Chelsea',
  'FC Barcelona',
  'Inter Milan',
  'Liverpool',
  'Manchester City',
  'PSG',
  'Real Madrid',
];

export const SCOUT_WORKSPACE_STORAGE_KEY = '@scoutx/scout-workspace/v1';

export const SEARCH_SUGGESTIONS = [
  'Winger',
  'Brazil',
  'Ajax',
  'Bundesliga',
  'High potential',
  'Verified',
  'CM',
  'Available',
];

export const DEFAULT_FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'preset-u21-potential',
    name: 'U21 High Potential',
    sort: 'potential',
    filters: {
      ...defaultDiscoveryFilters,
      ageMax: 21,
      potentialMin: 80,
    },
  },
  {
    id: 'preset-verified-wingers',
    name: 'Verified Wingers',
    sort: 'overall',
    filters: {
      ...defaultDiscoveryFilters,
      positions: ['LW', 'RW'],
      verifiedOnly: true,
    },
  },
  {
    id: 'preset-available-now',
    name: 'Available Now',
    sort: 'recently_updated',
    filters: {
      ...defaultDiscoveryFilters,
      availability: 'available',
      recentlyActive: true,
    },
  },
];

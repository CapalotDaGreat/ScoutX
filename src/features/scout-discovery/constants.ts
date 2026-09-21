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

export const SORT_OPTIONS: { value: DiscoverySortOption; label: string }[] = [
  { value: 'relevance', label: 'Best Match' },
  { value: 'overall', label: 'Overall Rating' },
  { value: 'potential', label: 'Potential' },
  { value: 'age', label: 'Age' },
  { value: 'name', label: 'Name' },
  { value: 'distance', label: 'Distance' },
  { value: 'recently_updated', label: 'Recently Updated' },
  { value: 'most_viewed', label: 'Most Viewed' },
  { value: 'sprint_speed', label: 'Sprint Speed' },
  { value: 'goals', label: 'Most Goals' },
  { value: 'assists', label: 'Most Assists' },
  { value: 'newest', label: 'Newest Players' },
];

export const POSITION_OPTIONS: { value: PlayerPosition; label: string }[] = [
  { value: 'GK', label: 'Goalkeeper' },
  { value: 'CB', label: 'Centre Back' },
  { value: 'LB', label: 'Left Back' },
  { value: 'RB', label: 'Right Back' },
  { value: 'CDM', label: 'Defensive Mid' },
  { value: 'CM', label: 'Central Mid' },
  { value: 'CAM', label: 'Attacking Mid' },
  { value: 'LW', label: 'Left Wing' },
  { value: 'RW', label: 'Right Wing' },
  { value: 'ST', label: 'Striker' },
  { value: 'CF', label: 'Centre Forward' },
];

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

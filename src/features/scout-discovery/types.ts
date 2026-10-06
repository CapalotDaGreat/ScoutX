export type PlayerPosition =
  | 'GK'
  | 'CB'
  | 'LB'
  | 'RB'
  | 'CDM'
  | 'CM'
  | 'CAM'
  | 'LW'
  | 'RW'
  | 'ST'
  | 'CF';

export type PreferredFoot = 'left' | 'right' | 'both';

export type PlayerAvailability = 'available' | 'unavailable' | 'on_loan';

export type FormResult = 'W' | 'D' | 'L';

/**
 * Attribute ratings are only populated when a real source exists (coach/club/analysis).
 * `null` means "not rated"; the UI must render it as such and never substitute a default.
 */
export type PlayerRatings = {
  passing: number | null;
  shooting: number | null;
  defending: number | null;
  physical: number | null;
};

/** Where a discovery value came from; mirrors `DataProvenance` from the evidence model. */
export type DiscoveryRatingSource = 'match_derived' | 'coach_provided' | 'club_provided' | 'ai_derived';

export type RadarStat = {
  label: string;
  value: number;
};

export type ClubHistoryEntry = {
  club: string;
  period: string;
  yearsAtClub?: number;
};

export type DiscoverablePlayer = {
  id: string;
  fullName: string;
  /** Null when the player has not provided a birth date. */
  age: number | null;
  nationality: string;
  club: string;
  league: string;
  /** Empty when the player has not set a position. */
  position: PlayerPosition[];
  preferredFoot: PreferredFoot;
  heightCm: number | null;
  weightKg: number | null;
  avatarUrl: string;
  coverImageUrl: string;
  biography: string;
  /** Average of logged match ratings (×10). Null until at least one match rating exists. */
  overallRating: number | null;
  overallRatingSource: DiscoveryRatingSource | null;
  /** Only present when produced by an explicit source; never derived from overall. */
  potentialRating: number | null;
  potentialRatingSource: DiscoveryRatingSource | null;
  availability: PlayerAvailability;
  verified: boolean;
  /** Self-reported 1–5 stars; null when never set. */
  weakFoot: number | null;
  skillMoves: number | null;
  matchCount: number;
  recentlyActive: boolean;
  hasHighlightVideos: boolean;
  updatedAt: string;
  viewCount: number;
  goals: number;
  assists: number;
  /** Only populated from GPS sessions. */
  sprintSpeedKmh: number | null;
  ratings: PlayerRatings;
  form: FormResult[];
  radarStats: RadarStat[];
  distanceKm: number | null;
  clubHistory: ClubHistoryEntry[];
  achievements: string[];
  searchKeywords: string[];
  username?: string;
};

export type DiscoverySortOption =
  | 'overall'
  | 'potential'
  | 'age'
  | 'name'
  | 'distance'
  | 'recently_updated'
  | 'most_viewed'
  | 'sprint_speed'
  | 'goals'
  | 'assists'
  | 'newest'
  | 'relevance';

/** Narrows free-text search to a single player attribute group. */
export type DiscoverySearchScope =
  | 'all'
  | 'name'
  | 'club'
  | 'position'
  | 'nationality'
  | 'league';

export type RecentSearchEntry = {
  term: string;
  scope: DiscoverySearchScope;
  searchedAt: string;
};

export type DiscoveryFilters = {
  ageMin: number | null;
  ageMax: number | null;
  positions: PlayerPosition[];
  nationalities: string[];
  preferredFoot: PreferredFoot | null;
  heightMin: number | null;
  heightMax: number | null;
  weightMin: number | null;
  weightMax: number | null;
  clubs: string[];
  leagues: string[];
  availability: PlayerAvailability | null;
  overallMin: number | null;
  potentialMin: number | null;
  distanceMaxKm: number | null;
  sprintSpeedMin: number | null;
  passingMin: number | null;
  shootingMin: number | null;
  defendingMin: number | null;
  physicalMin: number | null;
  weakFootMin: number | null;
  skillMovesMin: number | null;
  matchCountMin: number | null;
  recentlyActive: boolean;
  hasHighlightVideos: boolean;
  verifiedOnly: boolean;
};

export type DiscoveryQuery = {
  search: string;
  searchScope: DiscoverySearchScope;
  filters: DiscoveryFilters;
  sort: DiscoverySortOption;
};

export type DiscoveryPageResult = {
  players: DiscoverablePlayer[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type ScoutDashboardData = {
  featured: DiscoverablePlayer[];
  recommended: DiscoverablePlayer[];
  recentlyViewed: DiscoverablePlayer[];
  trending: DiscoverablePlayer[];
  nearby: DiscoverablePlayer[];
  matchingPreferences: DiscoverablePlayer[];
  matchingCount: number;
};

export type FilterPreset = {
  id: string;
  name: string;
  filters: DiscoveryFilters;
  sort: DiscoverySortOption;
  /** Optional free-text query restored when the preset is applied. */
  search?: string;
  searchScope?: DiscoverySearchScope;
};

export type ScoutWorkspaceSnapshot = {
  recentlyViewedIds: string[];
  recentSearches: RecentSearchEntry[];
  filterPresets: FilterPreset[];
  lastViewedPlayerId: string | null;
  comparisonPlayerIds: string[];
};

export type FilterChip = {
  id: string;
  label: string;
  filterKey?: keyof DiscoveryFilters;
  filterValue?: string | PlayerPosition;
};

export type ScoutNote = {
  playerId: string;
  note: string;
  updatedAt: string;
};

export const defaultDiscoveryFilters: DiscoveryFilters = {
  ageMin: null,
  ageMax: null,
  positions: [],
  nationalities: [],
  preferredFoot: null,
  heightMin: null,
  heightMax: null,
  weightMin: null,
  weightMax: null,
  clubs: [],
  leagues: [],
  availability: null,
  overallMin: null,
  potentialMin: null,
  distanceMaxKm: null,
  sprintSpeedMin: null,
  passingMin: null,
  shootingMin: null,
  defendingMin: null,
  physicalMin: null,
  weakFootMin: null,
  skillMovesMin: null,
  matchCountMin: null,
  recentlyActive: false,
  hasHighlightVideos: false,
  verifiedOnly: false,
};

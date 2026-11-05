import {
  type DiscoveryFilters,
  type FilterChip,
  type PlayerPosition,
} from '@/features/scout-discovery/types';

export function buildFilterChips(filters: DiscoveryFilters): FilterChip[] {
  filters = {
    ...filters,
    overallMin: null,
    potentialMin: null,
    sprintSpeedMin: null,
  };
  const chips: FilterChip[] = [];

  if (filters.ageMin !== null || filters.ageMax !== null) {
    chips.push({
      id: 'age-range',
      kind: 'ageRange',
      value: filters.ageMin ?? undefined,
      max: filters.ageMax,
      filterKey: 'ageMin',
    });
  }

  for (const position of filters.positions) {
    chips.push({
      id: `position-${position}`,
      kind: 'position',
      value: position,
      filterKey: 'positions',
      filterValue: position,
    });
  }

  for (const nationality of filters.nationalities) {
    chips.push({
      id: `nationality-${nationality}`,
      kind: 'raw',
      value: nationality,
      filterKey: 'nationalities',
      filterValue: nationality,
    });
  }

  if (filters.preferredFoot) {
    chips.push({
      id: 'preferred-foot',
      kind: 'foot',
      value: filters.preferredFoot,
      filterKey: 'preferredFoot',
    });
  }

  if (filters.overallMin !== null) {
    chips.push({ id: 'overall-min', kind: 'overall', value: filters.overallMin, filterKey: 'overallMin' });
  }

  if (filters.potentialMin !== null) {
    chips.push({
      id: 'potential-min',
      kind: 'potential',
      value: filters.potentialMin,
      filterKey: 'potentialMin',
    });
  }

  for (const club of filters.clubs) {
    chips.push({ id: `club-${club}`, kind: 'raw', value: club, filterKey: 'clubs', filterValue: club });
  }

  for (const league of filters.leagues) {
    chips.push({ id: `league-${league}`, kind: 'raw', value: league, filterKey: 'leagues', filterValue: league });
  }

  if (filters.availability) {
    chips.push({
      id: 'availability',
      kind: 'availability',
      value: filters.availability,
      filterKey: 'availability',
    });
  }

  if (filters.verifiedOnly) {
    chips.push({ id: 'verified-only', kind: 'verified', filterKey: 'verifiedOnly' });
  }

  if (filters.recentlyActive) {
    chips.push({ id: 'recently-active', kind: 'recentlyActive', filterKey: 'recentlyActive' });
  }

  if (filters.hasHighlightVideos) {
    chips.push({ id: 'has-videos', kind: 'hasVideos', filterKey: 'hasHighlightVideos' });
  }

  if (filters.sprintSpeedMin !== null) {
    chips.push({
      id: 'sprint-min',
      kind: 'sprint',
      value: filters.sprintSpeedMin,
      filterKey: 'sprintSpeedMin',
    });
  }

  if (filters.matchCountMin !== null) {
    chips.push({
      id: 'match-count-min',
      kind: 'matchCount',
      value: filters.matchCountMin,
      filterKey: 'matchCountMin',
    });
  }

  for (const role of filters.roles) {
    chips.push({
      id: `role-${role}`,
      kind: 'roles',
      value: role,
      filterKey: 'roles',
      filterValue: role,
    });
  }

  if (filters.minEvidenceCoverage) {
    chips.push({
      id: 'min-evidence-coverage',
      kind: 'coverage',
      value: filters.minEvidenceCoverage,
      filterKey: 'minEvidenceCoverage',
    });
  }

  if (filters.evidenceMaxAgeDays !== null) {
    chips.push({
      id: 'evidence-max-age',
      kind: 'evidenceAge',
      value: filters.evidenceMaxAgeDays,
      filterKey: 'evidenceMaxAgeDays',
    });
  }

  return chips;
}

export function removeFilterChip(
  filters: DiscoveryFilters,
  chip: FilterChip,
): DiscoveryFilters {
  if (!chip.filterKey) {
    return filters;
  }

  const next = { ...filters };

  switch (chip.filterKey) {
    case 'ageMin':
      return { ...next, ageMin: null, ageMax: null };
    case 'positions':
      return {
        ...next,
        positions: next.positions.filter((value) => value !== (chip.filterValue as PlayerPosition)),
      };
    case 'nationalities':
      return {
        ...next,
        nationalities: next.nationalities.filter((value) => value !== chip.filterValue),
      };
    case 'clubs':
      return {
        ...next,
        clubs: next.clubs.filter((value) => value !== chip.filterValue),
      };
    case 'leagues':
      return {
        ...next,
        leagues: next.leagues.filter((value) => value !== chip.filterValue),
      };
    case 'preferredFoot':
      return { ...next, preferredFoot: null };
    case 'overallMin':
      return { ...next, overallMin: null };
    case 'potentialMin':
      return { ...next, potentialMin: null };
    case 'availability':
      return { ...next, availability: null };
    case 'verifiedOnly':
      return { ...next, verifiedOnly: false };
    case 'recentlyActive':
      return { ...next, recentlyActive: false };
    case 'hasHighlightVideos':
      return { ...next, hasHighlightVideos: false };
    case 'sprintSpeedMin':
      return { ...next, sprintSpeedMin: null };
    case 'matchCountMin':
      return { ...next, matchCountMin: null };
    case 'roles':
      return {
        ...next,
        roles: next.roles.filter((value) => value !== chip.filterValue),
      };
    case 'minEvidenceCoverage':
      return { ...next, minEvidenceCoverage: null };
    case 'evidenceMaxAgeDays':
      return { ...next, evidenceMaxAgeDays: null };
    default:
      return { ...next, [chip.filterKey]: null };
  }
}

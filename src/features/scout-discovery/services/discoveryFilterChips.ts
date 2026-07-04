import { POSITION_OPTIONS } from '@/features/scout-discovery/constants';
import {
  type DiscoveryFilters,
  type FilterChip,
  type PlayerPosition,
} from '@/features/scout-discovery/types';

export function buildFilterChips(filters: DiscoveryFilters): FilterChip[] {
  const chips: FilterChip[] = [];

  if (filters.ageMin !== null || filters.ageMax !== null) {
    const min = filters.ageMin ?? '…';
    const max = filters.ageMax ?? '…';
    chips.push({ id: 'age-range', label: `Age ${min}–${max}`, filterKey: 'ageMin' });
  }

  for (const position of filters.positions) {
    const label = POSITION_OPTIONS.find((option) => option.value === position)?.label ?? position;
    chips.push({
      id: `position-${position}`,
      label,
      filterKey: 'positions',
      filterValue: position,
    });
  }

  for (const nationality of filters.nationalities) {
    chips.push({
      id: `nationality-${nationality}`,
      label: nationality,
      filterKey: 'nationalities',
      filterValue: nationality,
    });
  }

  if (filters.preferredFoot) {
    chips.push({
      id: 'preferred-foot',
      label: `${filters.preferredFoot} foot`,
      filterKey: 'preferredFoot',
    });
  }

  if (filters.overallMin !== null) {
    chips.push({ id: 'overall-min', label: `OVR ${filters.overallMin}+`, filterKey: 'overallMin' });
  }

  if (filters.potentialMin !== null) {
    chips.push({
      id: 'potential-min',
      label: `POT ${filters.potentialMin}+`,
      filterKey: 'potentialMin',
    });
  }

  for (const club of filters.clubs) {
    chips.push({ id: `club-${club}`, label: club, filterKey: 'clubs', filterValue: club });
  }

  for (const league of filters.leagues) {
    chips.push({ id: `league-${league}`, label: league, filterKey: 'leagues', filterValue: league });
  }

  if (filters.availability) {
    chips.push({
      id: 'availability',
      label: filters.availability.replace('_', ' '),
      filterKey: 'availability',
    });
  }

  if (filters.verifiedOnly) {
    chips.push({ id: 'verified-only', label: 'Verified', filterKey: 'verifiedOnly' });
  }

  if (filters.recentlyActive) {
    chips.push({ id: 'recently-active', label: 'Recently active', filterKey: 'recentlyActive' });
  }

  if (filters.hasHighlightVideos) {
    chips.push({ id: 'has-videos', label: 'Has videos', filterKey: 'hasHighlightVideos' });
  }

  if (filters.sprintSpeedMin !== null) {
    chips.push({
      id: 'sprint-min',
      label: `Sprint ${filters.sprintSpeedMin}+ km/h`,
      filterKey: 'sprintSpeedMin',
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
    default:
      return { ...next, [chip.filterKey]: null };
  }
}

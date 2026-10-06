import type {
  DiscoverablePlayer,
  DiscoveryFilters,
  FilterPreset,
} from '@/features/scout-discovery/types';

export type BriefCriterionId =
  | 'age'
  | 'position'
  | 'foot'
  | 'height'
  | 'availability'
  | 'nationality'
  | 'league'
  | 'club'
  | 'weak_foot'
  | 'skill_moves'
  | 'match_count'
  | 'recently_active'
  | 'video'
  | 'verified'
  | 'sprint_speed';

/** `unknown` means the player has not stated the fact; it is never counted as a miss. */
export type BriefCriterionResult = 'met' | 'not_met' | 'unknown';

export type BriefCriterion = {
  id: BriefCriterionId;
  result: BriefCriterionResult;
  /** What the brief asks for, e.g. "16–21" or "LW, RW". Raw values, not translated. */
  wanted: string;
  /** What the player record shows; empty when unknown. */
  actual: string;
};

export type BriefMatch = {
  presetId: string;
  presetName: string;
  criteria: BriefCriterion[];
  met: number;
  notMet: number;
  unknown: number;
};

/** Built-in presets are examples, not the scout's own brief. */
const BUILT_IN_PRESET_PREFIX = 'preset-';

function range(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min}–${max}`;
  if (min !== null) return `≥ ${min}`;
  return `≤ ${max}`;
}

function inRange(value: number, min: number | null, max: number | null): boolean {
  return (min === null || value >= min) && (max === null || value <= max);
}

function includesText(list: readonly string[], value: string): boolean {
  const target = value.trim().toLowerCase();
  return list.some((item) => item.trim().toLowerCase() === target);
}

/**
 * Compares a player against every active criterion of a saved scout brief. Facts the player
 * has not stated are reported as unknown rather than treated as a mismatch, so a thin
 * profile is never silently ranked below a contradicting one.
 */
export function evaluateBrief(player: DiscoverablePlayer, filters: DiscoveryFilters): BriefCriterion[] {
  const criteria: BriefCriterion[] = [];
  const push = (id: BriefCriterionId, result: BriefCriterionResult, wanted: string, actual: string) =>
    criteria.push({ id, result, wanted, actual: result === 'unknown' ? '' : actual });

  if (filters.ageMin !== null || filters.ageMax !== null) {
    const wanted = range(filters.ageMin, filters.ageMax);
    push(
      'age',
      player.age === null ? 'unknown' : inRange(player.age, filters.ageMin, filters.ageMax) ? 'met' : 'not_met',
      wanted,
      String(player.age ?? ''),
    );
  }

  if (filters.positions.length > 0) {
    push(
      'position',
      player.position.length === 0
        ? 'unknown'
        : player.position.some((position) => filters.positions.includes(position))
          ? 'met'
          : 'not_met',
      filters.positions.join(', '),
      player.position.join(', '),
    );
  }

  if (filters.preferredFoot !== null) {
    const foot = player.preferredFoot;
    push(
      'foot',
      foot === null ? 'unknown' : foot === filters.preferredFoot || foot === 'both' ? 'met' : 'not_met',
      filters.preferredFoot,
      foot ?? '',
    );
  }

  if (filters.heightMin !== null || filters.heightMax !== null) {
    push(
      'height',
      player.heightCm === null
        ? 'unknown'
        : inRange(player.heightCm, filters.heightMin, filters.heightMax)
          ? 'met'
          : 'not_met',
      range(filters.heightMin, filters.heightMax),
      String(player.heightCm ?? ''),
    );
  }

  if (filters.availability !== null) {
    push(
      'availability',
      player.availability === null ? 'unknown' : player.availability === filters.availability ? 'met' : 'not_met',
      filters.availability,
      player.availability ?? '',
    );
  }

  if (filters.nationalities.length > 0) {
    push(
      'nationality',
      !player.nationality.trim() ? 'unknown' : includesText(filters.nationalities, player.nationality) ? 'met' : 'not_met',
      filters.nationalities.join(', '),
      player.nationality,
    );
  }

  if (filters.leagues.length > 0) {
    push(
      'league',
      !player.league.trim() ? 'unknown' : includesText(filters.leagues, player.league) ? 'met' : 'not_met',
      filters.leagues.join(', '),
      player.league,
    );
  }

  if (filters.clubs.length > 0) {
    push(
      'club',
      !player.club.trim() ? 'unknown' : includesText(filters.clubs, player.club) ? 'met' : 'not_met',
      filters.clubs.join(', '),
      player.club,
    );
  }

  if (filters.weakFootMin !== null) {
    push(
      'weak_foot',
      player.weakFoot === null ? 'unknown' : player.weakFoot >= filters.weakFootMin ? 'met' : 'not_met',
      `≥ ${filters.weakFootMin}★`,
      player.weakFoot === null ? '' : `${player.weakFoot}★`,
    );
  }

  if (filters.skillMovesMin !== null) {
    push(
      'skill_moves',
      player.skillMoves === null ? 'unknown' : player.skillMoves >= filters.skillMovesMin ? 'met' : 'not_met',
      `≥ ${filters.skillMovesMin}★`,
      player.skillMoves === null ? '' : `${player.skillMoves}★`,
    );
  }

  if (filters.matchCountMin !== null) {
    push(
      'match_count',
      player.matchCount >= filters.matchCountMin ? 'met' : 'not_met',
      `≥ ${filters.matchCountMin}`,
      String(player.matchCount),
    );
  }

  if (filters.sprintSpeedMin !== null) {
    push(
      'sprint_speed',
      player.sprintSpeedKmh === null
        ? 'unknown'
        : player.sprintSpeedKmh >= filters.sprintSpeedMin
          ? 'met'
          : 'not_met',
      `≥ ${filters.sprintSpeedMin}`,
      String(player.sprintSpeedKmh ?? ''),
    );
  }

  if (filters.recentlyActive) {
    push('recently_active', player.recentlyActive ? 'met' : 'not_met', '', '');
  }
  if (filters.hasHighlightVideos) {
    push('video', player.hasHighlightVideos ? 'met' : 'not_met', '', '');
  }
  if (filters.verifiedOnly) {
    const verified = player.verified || player.verificationLevel === 'verified';
    push('verified', verified ? 'met' : 'not_met', '', '');
  }

  return criteria;
}

function summarize(preset: FilterPreset, criteria: BriefCriterion[]): BriefMatch {
  return {
    presetId: preset.id,
    presetName: preset.name,
    criteria,
    met: criteria.filter((item) => item.result === 'met').length,
    notMet: criteria.filter((item) => item.result === 'not_met').length,
    unknown: criteria.filter((item) => item.result === 'unknown').length,
  };
}

/**
 * The scout's own saved brief this player fits best (fewest misses, then most hits).
 * Returns null when the scout has not saved a brief with any active criterion.
 */
export function bestBriefMatch(player: DiscoverablePlayer, presets: readonly FilterPreset[]): BriefMatch | null {
  const matches = presets
    .filter((preset) => !preset.id.startsWith(BUILT_IN_PRESET_PREFIX))
    .map((preset) => summarize(preset, evaluateBrief(player, preset.filters)))
    .filter((match) => match.criteria.length > 0);
  if (matches.length === 0) return null;
  return matches.sort((a, b) => a.notMet - b.notMet || b.met - a.met)[0];
}

import type {
  DiscoverablePlayer,
  DiscoveryFilters,
  FilterPreset,
} from '@/features/scout-discovery/types';

const DAY_MS = 24 * 60 * 60 * 1000;

const COVERAGE_RANK = { insufficient: 0, limited: 1, moderate: 2, strong: 3 } as const;

/** The three football dimensions a brief's evidence requirement is checked against. */
const BRIEF_COVERAGE_DIMENSIONS = ['technical', 'tactical', 'physical'] as const;

/** Stated role labels and style tags, lower-cased for matching. */
export function playerRoleLabels(player: Pick<DiscoverablePlayer, 'roleDescriptors' | 'styleTags'>): string[] {
  return [...player.roleDescriptors.map((role) => role.label), ...player.styleTags]
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);
}

export function matchesRole(player: Pick<DiscoverablePlayer, 'roleDescriptors' | 'styleTags'>, roles: readonly string[]): boolean {
  const labels = playerRoleLabels(player);
  return roles.some((role) => labels.includes(role.trim().toLowerCase()));
}

/** Weakest coverage across technical, tactical and physical. */
export function weakestBriefCoverage(
  coverage: DiscoverablePlayer['evidenceCoverage'],
): keyof typeof COVERAGE_RANK {
  return BRIEF_COVERAGE_DIMENSIONS.map((dimension) => coverage[dimension]).reduce((weakest, state) =>
    COVERAGE_RANK[state] < COVERAGE_RANK[weakest] ? state : weakest,
  );
}

export function meetsEvidenceCoverage(
  coverage: DiscoverablePlayer['evidenceCoverage'],
  min: 'moderate' | 'strong' | null,
): boolean {
  return min === null || COVERAGE_RANK[weakestBriefCoverage(coverage)] >= COVERAGE_RANK[min];
}

/** Whole days since the newest evidence, or null when the player has none. */
export function evidenceAgeDays(lastEvidenceAt: string | null, nowMs: number = Date.now()): number | null {
  if (!lastEvidenceAt) return null;
  const at = Date.parse(lastEvidenceAt);
  return Number.isNaN(at) ? null : Math.max(0, Math.floor((nowMs - at) / DAY_MS));
}

export function meetsEvidenceFreshness(
  lastEvidenceAt: string | null,
  maxAgeDays: number | null,
  nowMs: number = Date.now(),
): boolean {
  if (maxAgeDays === null) return true;
  const age = evidenceAgeDays(lastEvidenceAt, nowMs);
  return age !== null && age <= maxAgeDays;
}

export type BriefCriterionId =
  | 'age'
  | 'position'
  | 'role'
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
  | 'sprint_speed'
  | 'evidence_coverage'
  | 'evidence_freshness';

/** `unknown` means the fact is missing; it is never counted as a miss. */
export type BriefCriterionResult = 'met' | 'not_met' | 'unknown';

/**
 * Where the compared value comes from. `self_reported` facts are the player's own statement,
 * `record` values are derived from logged matches, uploads or GPS, `verified` passed review.
 */
export type BriefCriterionConfidence = 'verified' | 'record' | 'self_reported';

/** Why a criterion is unknown: the player never stated it, or no records exist yet. */
export type BriefMissingInfo = 'not_stated' | 'no_records' | null;

export type BriefCriterion = {
  id: BriefCriterionId;
  result: BriefCriterionResult;
  /** What the brief asks for, e.g. "16–21" or "LW, RW". Raw values, not translated. */
  wanted: string;
  /** What the player record shows; empty when unknown. */
  actual: string;
  confidence: BriefCriterionConfidence;
  missing: BriefMissingInfo;
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

const RECORD_CRITERIA: ReadonlySet<BriefCriterionId> = new Set([
  'match_count',
  'recently_active',
  'video',
  'sprint_speed',
  'evidence_coverage',
  'evidence_freshness',
]);

/** Identity facts a completed verification vouches for. */
const IDENTITY_CRITERIA: ReadonlySet<BriefCriterionId> = new Set(['age', 'nationality', 'club']);

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

function confidenceFor(id: BriefCriterionId, player: DiscoverablePlayer): BriefCriterionConfidence {
  if (id === 'verified') return 'verified';
  if (RECORD_CRITERIA.has(id)) return 'record';
  if (IDENTITY_CRITERIA.has(id) && player.verificationLevel === 'verified') return 'verified';
  return 'self_reported';
}

/**
 * Compares a player against every active criterion of a saved scout brief. Missing facts are
 * reported as unknown with the reason, never treated as a mismatch, so a thin profile is not
 * silently ranked below a contradicting one.
 */
export function evaluateBrief(
  player: DiscoverablePlayer,
  filters: DiscoveryFilters,
  nowMs: number = Date.now(),
): BriefCriterion[] {
  const criteria: BriefCriterion[] = [];
  const push = (id: BriefCriterionId, result: BriefCriterionResult, wanted: string, actual: string) => {
    const confidence = confidenceFor(id, player);
    criteria.push({
      id,
      result,
      wanted,
      actual: result === 'unknown' ? '' : actual,
      confidence,
      missing: result !== 'unknown' ? null : confidence === 'record' ? 'no_records' : 'not_stated',
    });
  };

  if (filters.ageMin !== null || filters.ageMax !== null) {
    push(
      'age',
      player.age === null ? 'unknown' : inRange(player.age, filters.ageMin, filters.ageMax) ? 'met' : 'not_met',
      range(filters.ageMin, filters.ageMax),
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

  const roles = filters.roles ?? [];
  if (roles.length > 0) {
    const stated = player.roleDescriptors.length + player.styleTags.length > 0;
    push(
      'role',
      !stated ? 'unknown' : matchesRole(player, roles) ? 'met' : 'not_met',
      roles.join(', '),
      [...player.roleDescriptors.map((role) => role.label), ...player.styleTags].join(', '),
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

  if (filters.minEvidenceCoverage) {
    const weakest = weakestBriefCoverage(player.evidenceCoverage);
    push(
      'evidence_coverage',
      meetsEvidenceCoverage(player.evidenceCoverage, filters.minEvidenceCoverage) ? 'met' : 'not_met',
      filters.minEvidenceCoverage,
      weakest,
    );
  }

  if (filters.evidenceMaxAgeDays !== null && filters.evidenceMaxAgeDays !== undefined) {
    const age = evidenceAgeDays(player.lastEvidenceAt, nowMs);
    push(
      'evidence_freshness',
      age === null ? 'unknown' : age <= filters.evidenceMaxAgeDays ? 'met' : 'not_met',
      `≤ ${filters.evidenceMaxAgeDays}d`,
      age === null ? '' : `${age}d`,
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

export function isOwnBrief(preset: FilterPreset): boolean {
  return !preset.id.startsWith(BUILT_IN_PRESET_PREFIX);
}

/**
 * The scout's own saved brief this player fits best (fewest misses, then most hits).
 * Returns null when the scout has not saved a brief with any active criterion.
 */
export function bestBriefMatch(
  player: DiscoverablePlayer,
  presets: readonly FilterPreset[],
  nowMs: number = Date.now(),
): BriefMatch | null {
  const matches = presets
    .filter(isOwnBrief)
    .map((preset) => summarize(preset, evaluateBrief(player, preset.filters, nowMs)))
    .filter((match) => match.criteria.length > 0);
  if (matches.length === 0) return null;
  return matches.sort((a, b) => a.notMet - b.notMet || b.met - a.met)[0];
}

/** A brief match with no misses: every stated fact fits and only unknowns remain. */
export function isFullBriefFit(match: BriefMatch | null): boolean {
  return match !== null && match.notMet === 0 && match.met > 0;
}

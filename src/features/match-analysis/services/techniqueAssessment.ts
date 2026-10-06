import type {
  TechniqueAssessment,
  TechniqueDimension,
  TechniqueRating,
  TechniqueRatingStatus,
} from '@/features/match-analysis/types';

export const TECHNIQUE_DIMENSIONS: readonly TechniqueDimension[] = [
  'weakFoot',
  'skillMoves',
  'firstTouch',
  'passing',
  'dribbling',
  'shooting',
];

const STATUSES: readonly TechniqueRatingStatus[] = [
  'rated',
  'insufficient_evidence',
  'identity_unconfirmed',
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stars(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return value >= 1 && value <= 5 ? value : null;
}

function parseRating(dimension: TechniqueDimension, raw: unknown): TechniqueRating {
  const row = asRecord(raw) ?? {};
  const value = stars(row.stars);
  const status = STATUSES.find((item) => item === row.status) ?? 'insufficient_evidence';
  return {
    dimension,
    stars: status === 'rated' ? value : null,
    status: status === 'rated' && value === null ? 'insufficient_evidence' : status,
    summary: typeof row.summary === 'string' ? row.summary : '',
    tip: typeof row.tip === 'string' && row.tip ? row.tip : null,
    frameIds: Array.isArray(row.frameIds)
      ? row.frameIds.filter((id): id is string => typeof id === 'string')
      : [],
    confidence: status === 'rated' && value !== null ? 'Limited' : 'Insufficient',
  };
}

/**
 * Reads the stored assessment defensively. Reports written before technique stars existed
 * return null, and a malformed rating degrades to "insufficient evidence", never to a score.
 */
export function parseTechniqueAssessment(raw: unknown): TechniqueAssessment | null {
  const record = asRecord(raw);
  if (!record || !Array.isArray(record.ratings)) {
    return null;
  }
  const byDimension = new Map<string, unknown>();
  for (const item of record.ratings) {
    const row = asRecord(item);
    if (row && typeof row.dimension === 'string') {
      byDimension.set(row.dimension, item);
    }
  }
  const ratings = TECHNIQUE_DIMENSIONS.map((dimension) =>
    parseRating(dimension, byDimension.get(dimension)),
  );
  const self = asRecord(record.selfReported) ?? {};
  const ratedCount = ratings.filter((rating) => rating.stars !== null).length;
  return {
    scale: 'stars_1_5',
    basis: 'sampled_frames',
    ratings,
    ratedCount,
    overallSummary:
      ratedCount > 0 && typeof record.overallSummary === 'string' ? record.overallSummary : '',
    selfReported: {
      strongFoot: typeof self.strongFoot === 'string' ? self.strongFoot : null,
      weakFoot: stars(self.weakFoot),
      skillMoves: stars(self.skillMoves),
    },
  };
}

export type SelfRatingComparison = 'matches' | 'footage_lower' | 'footage_higher';

/** Compares the player's own star claim with what the footage showed. Null when either is unknown. */
export function compareWithSelfRating(
  assessment: TechniqueAssessment,
  dimension: 'weakFoot' | 'skillMoves',
): { self: number; footage: number; result: SelfRatingComparison } | null {
  const self = assessment.selfReported[dimension];
  const footage = assessment.ratings.find((rating) => rating.dimension === dimension)?.stars ?? null;
  if (self === null || footage === null) {
    return null;
  }
  const result: SelfRatingComparison =
    footage === self ? 'matches' : footage < self ? 'footage_lower' : 'footage_higher';
  return { self, footage, result };
}

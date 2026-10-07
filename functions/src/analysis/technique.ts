/**
 * Technique star assessment (EA FC style, 1–5) derived from sampled still frames.
 * A star rating is only kept when the player confirmed their identity and the model cited
 * enough known frames. Everything else stays unknown instead of guessed.
 */
import { cleanModelText } from '../ai/outputValidator';

export const TECHNIQUE_DIMENSIONS = [
  'weakFoot',
  'skillMoves',
  'firstTouch',
  'passing',
  'dribbling',
  'shooting',
] as const;

export type TechniqueDimension = (typeof TECHNIQUE_DIMENSIONS)[number];

export const MIN_TECHNIQUE_FRAMES = 2;

export type TechniqueRatingStatus = 'rated' | 'insufficient_evidence' | 'identity_unconfirmed';

export type TechniqueRating = {
  dimension: TechniqueDimension;
  stars: number | null;
  status: TechniqueRatingStatus;
  summary: string;
  tip: string | null;
  frameIds: string[];
  confidence: 'Limited' | 'Insufficient';
};

export type SelfReportedStars = {
  strongFoot: string | null;
  weakFoot: number | null;
  skillMoves: number | null;
};

export type TechniqueAssessment = {
  scale: 'stars_1_5';
  basis: 'sampled_frames';
  ratings: TechniqueRating[];
  ratedCount: number;
  overallSummary: string;
  selfReported: SelfReportedStars;
};

function toStars(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  return rounded >= 1 && rounded <= 5 ? rounded : null;
}

function text(value: unknown, max = 400): string {
  return cleanModelText(value, max);
}

export function parseSelfReportedStars(identity: unknown): SelfReportedStars {
  const record =
    identity && typeof identity === 'object' && !Array.isArray(identity)
      ? (identity as Record<string, unknown>)
      : {};
  const foot = record.strongFoot;
  return {
    strongFoot: foot === 'left' || foot === 'right' || foot === 'both' ? foot : null,
    weakFoot: toStars(record.weakFootRating),
    skillMoves: toStars(record.skillMovesRating),
  };
}

export function normalizeTechniqueAssessment(
  raw: unknown,
  knownFrameIds: Set<string>,
  identityConfirmed: boolean,
  selfReported: SelfReportedStars,
): TechniqueAssessment {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  const ratings = TECHNIQUE_DIMENSIONS.map((dimension): TechniqueRating => {
    const entry = source[dimension];
    const row =
      entry && typeof entry === 'object' && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : {};
    const frameIds = Array.isArray(row.frameIds)
      ? [...new Set(row.frameIds.filter((id): id is string => typeof id === 'string' && knownFrameIds.has(id)))]
      : [];

    if (!identityConfirmed) {
      return {
        dimension,
        stars: null,
        status: 'identity_unconfirmed',
        summary: '',
        tip: null,
        frameIds: [],
        confidence: 'Insufficient',
      };
    }

    const stars = frameIds.length >= MIN_TECHNIQUE_FRAMES ? toStars(row.stars) : null;
    const tip = text(row.tip, 240);
    return {
      dimension,
      stars,
      status: stars === null ? 'insufficient_evidence' : 'rated',
      summary: frameIds.length > 0 ? text(row.summary) : '',
      tip: frameIds.length > 0 && tip ? tip : null,
      frameIds,
      confidence: stars === null ? 'Insufficient' : 'Limited',
    };
  });

  const ratedCount = ratings.filter((rating) => rating.stars !== null).length;

  return {
    scale: 'stars_1_5',
    basis: 'sampled_frames',
    ratings,
    ratedCount,
    overallSummary: identityConfirmed && ratedCount > 0 ? text(source.overallSummary, 600) : '',
    selfReported,
  };
}

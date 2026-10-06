export const STAR_RATING_MIN = 1;
export const STAR_RATING_MAX = 5;

/** Whole stars from 1 to 5. Anything else is unknown, never coerced to a default. */
export function toStarRating(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  return rounded >= STAR_RATING_MIN && rounded <= STAR_RATING_MAX ? rounded : null;
}

/** Text form for compact cells, e.g. 3 -> "★★★☆☆". Unknown stays an em dash. */
export function starGlyphs(value: number | null): string {
  const stars = toStarRating(value);
  if (stars === null) {
    return '—';
  }
  return '★'.repeat(stars) + '☆'.repeat(STAR_RATING_MAX - stars);
}

export type StarLevelKey = 'one' | 'two' | 'three' | 'four' | 'five';

const LEVEL_KEYS: readonly StarLevelKey[] = ['one', 'two', 'three', 'four', 'five'];

/** Stable key for per-level copy such as "4★ weak foot: comfortable with both feet". */
export function starLevelKey(value: number): StarLevelKey {
  const stars = toStarRating(value) ?? STAR_RATING_MIN;
  return LEVEL_KEYS[stars - 1] ?? 'one';
}

/** Tapping the currently selected star clears the value. */
export function nextStarSelection(current: number | null, tapped: number): number | null {
  const stars = toStarRating(tapped);
  if (stars === null) {
    return current;
  }
  return current === stars ? null : stars;
}

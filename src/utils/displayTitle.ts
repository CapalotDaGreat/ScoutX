/**
 * Older system timeline entries were stored with a leading emoji ("⚽ First Match Logged").
 * New entries are stored without one; this removes it from stored titles at display time.
 * Only a leading pictograph plus its following space is removed, so user-written titles are untouched otherwise.
 */
const LEADING_GLYPH = /^(?:\p{Extended_Pictographic}️?‍?)+\s+/u;

export function displayTitle(title: string): string {
  return title.replace(LEADING_GLYPH, '');
}

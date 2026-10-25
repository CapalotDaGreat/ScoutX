/** Canonical public-projection search policy; sync checked server copy before building. */
export const SEARCH_VERSION = 1;
export const SEARCH_SORTS = ['relevance', 'recently_updated', 'age', 'name', 'distance', 'most_viewed', 'sprint_speed', 'weak_foot', 'skill_moves', 'goals', 'assists'] as const;
export type SearchSort = typeof SEARCH_SORTS[number];
export type SearchScope = 'all' | 'name' | 'club' | 'position' | 'nationality' | 'league';
type RecordValue = Record<string, unknown>;
export function searchWords(value: string): string[] {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}
export function publicSearchFields(player: RecordValue): Record<Exclude<SearchScope, 'all'>, string[]> {
  const text = (value: unknown) => typeof value === 'string' ? value.slice(0, 180) : '';
  return { name: [text(player.fullName), text(player.username)], club: [text(player.club)],
    position: Array.isArray(player.position) ? player.position.slice(0, 12).map(text) : [],
    nationality: [text(player.nationality)], league: [text(player.league)] };
}
export function indexedSearchMatches(player: RecordValue, search: string, scope: SearchScope): boolean {
  const fields = publicSearchFields(player);
  const words = (scope === 'all' ? Object.values(fields).flat() : fields[scope]).flatMap(searchWords);
  return searchWords(search).every((term) => words.some((word) => word.startsWith(term)));
}
export function normalizeSearchSort(value: string): SearchSort {
  return (SEARCH_SORTS as readonly string[]).includes(value) ? value as SearchSort : 'recently_updated';
}
function numberKey(value: unknown, descending = false): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 8_000_000_000_000) return '1';
  const scaled = Math.round(value * 1000);
  return `0${String(descending ? 8_000_000_000_000_000 - scaled : scaled).padStart(16, '0')}`;
}
export function publicEvidenceRank(player: RecordValue): number {
  return (player.verified === true ? 25 : 0) + (player.recentlyActive === true ? 20 : 0) + (player.hasHighlightVideos === true ? 15 : 0);
}
export function buildDiscoverySearchIndex(player: RecordValue): { version: number; tokens: string[]; order: Record<SearchSort, string> } {
  const tokens = new Set<string>();
  for (const [scope, fields] of Object.entries(publicSearchFields(player))) for (const word of fields.flatMap(searchWords)) {
    const letters = Array.from(word).slice(0, 32);
    for (let i = 1; i <= letters.length; i++) {
      const prefix = letters.slice(0, i).join('');
      tokens.add(`${scope}:${prefix}`); tokens.add(`all:${prefix}`);
    }
  }
  const date = typeof player.updatedAt === 'string' ? Date.parse(player.updatedAt) : NaN;
  const evidenceRank = publicEvidenceRank(player);
  const name = typeof player.fullName === 'string' ? player.fullName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().slice(0, 180) : '';
  return { version: SEARCH_VERSION, tokens: [...tokens].sort(), order: {
    relevance: numberKey(evidenceRank, true), recently_updated: numberKey(date, true),
    age: numberKey(player.age), name: name ? `0${name}` : '1', distance: numberKey(player.distanceKm),
    most_viewed: numberKey(player.viewCount, true), sprint_speed: numberKey(player.sprintSpeedKmh, true),
    weak_foot: numberKey(player.weakFoot, true), skill_moves: numberKey(player.skillMoves, true),
    goals: numberKey(player.goals, true), assists: numberKey(player.assists, true),
  } };
}

export function sameDiscoverySearchIndex(value: unknown, expected: ReturnType<typeof buildDiscoverySearchIndex>): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = value as RecordValue;
  const order = actual.order;
  return actual.version === expected.version && JSON.stringify(actual.tokens) === JSON.stringify(expected.tokens)
    && !!order && typeof order === 'object' && !Array.isArray(order)
    && Object.keys(order).length === SEARCH_SORTS.length
    && SEARCH_SORTS.every((key) => (order as RecordValue)[key] === expected.order[key]);
}

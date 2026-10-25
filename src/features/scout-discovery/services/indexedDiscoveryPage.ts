import type { DiscoverablePlayer, DiscoveryQuery, DiscoveryPageResult } from '../types';
import { normalizeSearchSort, searchWords, type SearchSort } from './discoverySearchIndex';

export type IndexCursor = { id: string; order: string };
export type IndexRow = IndexCursor & { player: DiscoverablePlayer | null };
export const SEARCH_BATCH_SIZE = 50;
export const SEARCH_READ_BUDGET = 200;
export function discoveryIndexQuery(query: DiscoveryQuery): { sort: SearchSort; token: string | null; identity: string } {
  const scope = query.searchScope ?? 'all';
  const words = searchWords(query.search);
  if (query.search.length > 256 || words.length > 12) throw new Error('Search must contain at most 12 terms and 256 characters.');
  const sort = normalizeSearchSort(query.sort);
  return { sort, token: words.length ? `${scope}:${Array.from(words[0]).slice(0, 32).join('')}` : null,
    identity: JSON.stringify({ search: words, scope, sort, filters: query.filters }, (_key, value: unknown) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value) };
}
export async function readIndexedDiscoveryPage(query: DiscoveryQuery, cursor: string | null, pageSize: number,
  readBatch: (after: IndexCursor | null) => Promise<IndexRow[]>, matches: (player: DiscoverablePlayer) => boolean): Promise<DiscoveryPageResult> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 40) throw new Error('Invalid discovery page size.');
  const { identity } = discoveryIndexQuery(query);
  let after: IndexCursor | null = null;
  if (cursor !== null) {
    if (cursor.length > 16_384) throw new Error('Invalid discovery cursor.');
    const value: unknown = JSON.parse(cursor);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid discovery cursor.');
    const v = value as Record<string, unknown>;
    if (v.version !== 1 || v.identity !== identity || typeof v.id !== 'string' || !/^[^/]{1,1500}$/.test(v.id)
      || typeof v.order !== 'string' || v.order.length > 256) throw new Error('Search changed; restart discovery.');
    after = { id: v.id, order: v.order };
  }
  const players: DiscoverablePlayer[] = [];
  let reads = 0, hasMore = true;
  while (reads < SEARCH_READ_BUDGET && players.length < pageSize && hasMore) {
    const batch = await readBatch(after);
    if (batch.length > SEARCH_BATCH_SIZE) throw new Error('Invalid discovery batch.');
    reads += batch.length;
    hasMore = batch.length === SEARCH_BATCH_SIZE;
    for (let i = 0; i < batch.length; i++) {
      const row = batch[i];
      if (after && row.id === after.id && row.order === after.order) throw new Error('Discovery cursor did not advance.');
      after = { id: row.id, order: row.order };
      if (row.player && matches(row.player)) players.push(row.player);
      if (players.length === pageSize) { hasMore = i < batch.length - 1 || hasMore; break; }
    }
  }
  return { players, hasMore, nextCursor: hasMore && after ? JSON.stringify({ version: 1, identity, ...after }) : null };
}

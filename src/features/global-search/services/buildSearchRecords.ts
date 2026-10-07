import type { SearchHit } from '@/features/global-search/services/searchIndex';

export function buildScoutSearchRecords(
  entries: ReadonlyArray<{ playerId: string; playerName?: string; stage: string }>,
): SearchHit[] {
  return entries.map((entry) => ({
    id: `player-${entry.playerId}`,
    kind: 'player' as const,
    title: entry.playerName?.trim() || entry.playerId,
    subtitle: entry.stage,
    route: 'player' as const,
    entityId: entry.playerId,
  }));
}

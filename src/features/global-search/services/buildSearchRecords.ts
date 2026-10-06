import type { SearchHit } from '@/features/global-search/services/searchIndex';

export function buildPlayerSearchRecords(input: {
  matches?: ReadonlyArray<{ id: string; opponent: string; result: string; date: string }>;
  journey?: ReadonlyArray<{ id: string; title: string; date: string }>;
  trials?: ReadonlyArray<{ id: string; club: string; status: string }>;
}): SearchHit[] {
  return [
    ...(input.matches ?? []).map((match) => ({
      id: `match-${match.id}`,
      kind: 'match' as const,
      title: match.opponent,
      subtitle: `${match.result} · ${match.date.slice(0, 10)}`,
      route: 'match' as const,
      entityId: match.id,
    })),
    ...(input.journey ?? []).map((entry) => ({
      id: `journey-${entry.id}`,
      kind: 'journey' as const,
      title: entry.title,
      subtitle: entry.date.slice(0, 10),
      route: 'career' as const,
      entityId: entry.id,
    })),
    ...(input.trials ?? []).map((trial) => ({
      id: `trial-${trial.id}`,
      kind: 'trial' as const,
      title: trial.club,
      subtitle: trial.status,
      route: 'trials' as const,
      entityId: trial.id,
    })),
  ];
}

export function buildScoutSearchRecords(
  entries: ReadonlyArray<{ playerId: string; stage: string }>,
): SearchHit[] {
  return entries.map((entry) => ({
    id: `player-${entry.playerId}`,
    kind: 'player' as const,
    title: entry.playerId,
    subtitle: entry.stage,
    route: 'player' as const,
    entityId: entry.playerId,
  }));
}

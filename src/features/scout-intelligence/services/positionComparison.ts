import type { PlayerPosition } from '@/features/scout-discovery/types';
import type { ComparisonSectionKey } from '@/features/player-comparison/types';
import type { PositionGroup } from '@/features/scout-intelligence/types';

const GROUP_BY_POSITION: Record<PlayerPosition, PositionGroup> = {
  GK: 'goalkeeper',
  CB: 'defender',
  LB: 'defender',
  RB: 'defender',
  CDM: 'midfielder',
  CM: 'midfielder',
  CAM: 'midfielder',
  LW: 'forward',
  RW: 'forward',
  ST: 'forward',
  CF: 'forward',
};

export function isPlayerPosition(value: string): value is PlayerPosition {
  return Object.prototype.hasOwnProperty.call(GROUP_BY_POSITION, value);
}

export function positionGroupFor(positions: PlayerPosition[]): PositionGroup | null {
  if (positions.length === 0) {
    return null;
  }
  const counts: Record<PositionGroup, number> = {
    goalkeeper: 0,
    defender: 0,
    midfielder: 0,
    forward: 0,
  };
  for (const position of positions) {
    counts[GROUP_BY_POSITION[position]] += 1;
  }
  const ranked = (Object.keys(counts) as PositionGroup[]).sort((a, b) => counts[b] - counts[a]);
  const top = ranked[0];
  return top && counts[top] > 0 ? top : null;
}

export function sharedPositionGroup(
  players: ReadonlyArray<{ position: PlayerPosition[] }>,
): PositionGroup | null {
  if (players.length === 0) {
    return null;
  }
  const groups = players.map((player) => positionGroupFor(player.position));
  const first = groups[0];
  if (!first || groups.some((group) => group !== first)) {
    return null;
  }
  return first;
}

export function comparisonSectionsForGroup(group: PositionGroup | null): ComparisonSectionKey[] {
  if (group === 'goalkeeper') {
    return ['physical', 'statistics', 'videos', 'career'];
  }
  if (group === 'defender') {
    return ['statistics', 'technical', 'physical', 'gps', 'videos', 'career'];
  }
  if (group === 'midfielder') {
    return ['statistics', 'technical', 'videos', 'career', 'gps'];
  }
  if (group === 'forward') {
    return ['statistics', 'technical', 'videos', 'career'];
  }
  return ['statistics', 'physical', 'career', 'videos'];
}

/** Statistic keys that are meaningful for a position group. Unknown groups keep recorded output only. */
export function statisticKeysForGroup(group: PositionGroup | null): string[] {
  if (group === 'goalkeeper') {
    return ['matches'];
  }
  if (group === 'defender') {
    return ['matches', 'tackles'];
  }
  if (group === 'midfielder') {
    return ['matches', 'assists', 'goals'];
  }
  if (group === 'forward') {
    return ['goals', 'assists', 'matches'];
  }
  return ['matches', 'goals', 'assists'];
}

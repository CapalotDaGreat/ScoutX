import type { CoachObservation, CoachRoster, CoachRosterPlayer } from '@/features/coach-mode/types';

export function emptyCoachRoster(coachId: string, nowIso = new Date().toISOString()): CoachRoster {
  return { coachId, players: [], updatedAt: nowIso };
}

export function addPlayerToRoster(
  roster: CoachRoster,
  playerId: string,
  nowIso = new Date().toISOString(),
): CoachRoster {
  if (roster.players.some((item) => item.playerId === playerId)) {
    return roster;
  }
  const player: CoachRosterPlayer = { playerId, addedAt: nowIso, notes: '' };
  return { coachId: roster.coachId, players: [...roster.players, player], updatedAt: nowIso };
}

export function createCoachObservation(
  coachId: string,
  playerId: string,
  body: string,
  matchId: string | null,
  nowIso = new Date().toISOString(),
): CoachObservation | null {
  const trimmed = body.trim();
  if (!trimmed) {
    return null;
  }
  return {
    id: `obs-${coachId}-${playerId}-${nowIso}`,
    coachId,
    playerId,
    body: trimmed.slice(0, 2000),
    matchId,
    provenance: 'coach_provided',
    createdAt: nowIso,
  };
}

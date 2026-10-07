export type CoachRosterPlayer = {
  playerId: string;
  addedAt: string;
  notes: string;
};

export type CoachRoster = {
  coachId: string;
  players: CoachRosterPlayer[];
  /** Mirrors players[].playerId so account deletion can find rosters naming a player. */
  playerIds: string[];
  updatedAt: string;
};

export type CoachObservation = {
  id: string;
  coachId: string;
  playerId: string;
  body: string;
  matchId: string | null;
  provenance: 'coach_provided';
  createdAt: string;
};

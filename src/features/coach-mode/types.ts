export type CoachRosterPlayer = {
  playerId: string;
  addedAt: string;
  notes: string;
};

export type CoachRoster = {
  coachId: string;
  players: CoachRosterPlayer[];
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

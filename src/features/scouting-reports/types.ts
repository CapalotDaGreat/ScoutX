/**
 * A rating is null until the scout explicitly sets it. Reports never start from a
 * pre-filled number, so an unrated dimension is visibly unrated.
 */
export type ScoutingReportRatings = {
  overall: number | null;
  potential: number | null;
  technicalAbility: number | null;
  tacticalIntelligence: number | null;
  physicalAbility: number | null;
  mentality: number | null;
};

export type ScoutingReport = {
  id: string;
  scoutId: string;
  scoutName?: string;
  playerId: string;
  playerName: string;
  ratings: ScoutingReportRatings;
  strengths: string[];
  weaknesses: string[];
  recommendations: string;
  suitablePlayingStyle: string;
  suggestedFormation: string;
  scoutNotes: string;
  createdAt: string;
  updatedAt: string;
};

export type ScoutingReportDraft = Omit<
  ScoutingReport,
  'id' | 'scoutId' | 'playerId' | 'playerName' | 'createdAt' | 'updatedAt'
> & {
  scoutName?: string;
};

/** All dimensions unrated. */
export const defaultScoutingReportRatings = (): ScoutingReportRatings => ({
  overall: null,
  potential: null,
  technicalAbility: null,
  tacticalIntelligence: null,
  physicalAbility: null,
  mentality: null,
});

/** Value a rating field starts from when the scout taps "set rating" (midpoint of the scale). */
export const SCOUTING_RATING_START = 50;

export const createEmptyScoutingReportDraft = (
  _playerName?: string,
): ScoutingReportDraft => ({
  scoutName: undefined,
  ratings: defaultScoutingReportRatings(),
  strengths: [],
  weaknesses: [],
  recommendations: '',
  // Style and formation are the scout's judgement; leave them blank until chosen.
  suitablePlayingStyle: '',
  suggestedFormation: '',
  scoutNotes: '',
});

export function hasAnyScoutingRating(ratings: ScoutingReportRatings): boolean {
  return Object.values(ratings).some((value) => value !== null);
}

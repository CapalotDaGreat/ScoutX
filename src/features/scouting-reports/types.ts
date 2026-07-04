export type ScoutingReportRatings = {
  overall: number;
  potential: number;
  technicalAbility: number;
  tacticalIntelligence: number;
  physicalAbility: number;
  mentality: number;
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

export const defaultScoutingReportRatings = (): ScoutingReportRatings => ({
  overall: 70,
  potential: 75,
  technicalAbility: 70,
  tacticalIntelligence: 70,
  physicalAbility: 70,
  mentality: 70,
});

export const createEmptyScoutingReportDraft = (
  playerName: string,
): ScoutingReportDraft => ({
  scoutName: undefined,
  ratings: defaultScoutingReportRatings(),
  strengths: [],
  weaknesses: [],
  recommendations: '',
  suitablePlayingStyle: 'Possession-based',
  suggestedFormation: '4-2-3-1',
  scoutNotes: '',
});

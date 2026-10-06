export type CareerMomentKind =
  | 'match'
  | 'trial'
  | 'journey'
  | 'milestone'
  | 'goal';

export type CareerMoment = {
  id: string;
  kind: CareerMomentKind;
  title: string;
  detail: string | null;
  occurredAt: string;
  sourceId: string;
};

export type YearInReviewSnapshot = {
  id: string;
  playerId: string;
  year: number;
  matchCount: number;
  goals: number | null;
  assists: number | null;
  trialCount: number;
  momentCount: number;
  generatedAt: string;
  narrative: {
    text: string;
    label: 'generated_from_records';
  };
};

export type FootballStory = {
  playerId: string;
  paragraphs: string[];
  momentIds: string[];
  label: 'generated_from_records';
  generatedAt: string;
};

export type TrialReplayStep = {
  id: string;
  action: string;
  at: string;
  note: string | null;
};

export type TrialReplay = {
  trialId: string;
  playerId: string;
  scoutId: string;
  steps: TrialReplayStep[];
};

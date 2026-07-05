export type CareerReplayHighlight = {
  label: string;
  value: string;
};

export type CareerReplayData = {
  seasonLabel: string;
  playerName: string;
  position: string;
  club: string;
  matchCount: number;
  totalGoals: number;
  totalAssists: number;
  bestRating: number | null;
  bestRatingOpponent: string | null;
  milestonesEarned: number;
  portfolioViews: number;
  scoutViews: number;
  highlights: CareerReplayHighlight[];
  narrative: string;
};

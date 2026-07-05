import { type CareerReplayData } from '@/features/career-replay/types';

export const EMPTY_CAREER_REPLAY: CareerReplayData = {
  seasonLabel: '',
  playerName: '',
  position: '',
  club: '',
  matchCount: 0,
  totalGoals: 0,
  totalAssists: 0,
  bestRating: null,
  bestRatingOpponent: null,
  milestonesEarned: 0,
  portfolioViews: 0,
  scoutViews: 0,
  highlights: [],
  narrative: '',
};

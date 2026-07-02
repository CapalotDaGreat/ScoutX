import { type PlayerMatchStatistics } from '@/features/player-statistics/types';

export type PlayerProfileStat = {
  label: string;
  value: string;
  trend: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
  };
};

export type PlayerProfilePerformanceItem = {
  label: string;
  value: number;
  max: number;
  hint: string;
};

export type PlayerProfile = {
  id: string;
  fullName: string;
  position: string;
  club: string;
  nationality: string;
  preferredFoot: string;
  height: string;
  weight: string;
  biography: string;
  coverImageUrl: string;
  avatarUrl: string;
  stats: PlayerProfileStat[];
  performanceSummary: PlayerProfilePerformanceItem[];
  statisticsMatches?: PlayerMatchStatistics[];
};

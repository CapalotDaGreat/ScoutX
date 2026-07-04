import { type PlayerMatchStatistics } from '@/features/player-statistics/types';
import {
  type FootballIdentity,
  defaultFootballIdentity,
} from '@/features/player-profile/types/footballIdentity';
import { type FootballJourney } from '@/features/football-journey/types';
import { type HighlightVideoLibrary } from '@/features/highlight-videos/types';

export type {
  FootballIdentity,
  ClubHistoryEntry,
  CareerTimelineEntry,
  PreferredFoot,
  ContractStatus,
  PlayerAvailabilityStatus,
  TransferStatus,
  AcademicStatus,
} from '@/features/player-profile/types/footballIdentity';

export { defaultFootballIdentity };

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
  identity: FootballIdentity;
  footballJourney?: FootballJourney;
  highlightVideos?: HighlightVideoLibrary;
};

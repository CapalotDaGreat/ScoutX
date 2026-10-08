import { type PlayerProfile } from '@/features/player-profile/types';
import { type PrivacySettings } from '@/features/player-profile/types/privacySettings';
import { type TrustRecommendation } from '@/features/trust-system/types';
import { type GpsSession } from '@/features/gps/types';
import { type PublicFootballSource } from '@/features/football-sources/core';

export type PublicPortfolioData = {
  playerId: string;
  profile: PlayerProfile;
  privacy: PrivacySettings;
  recommendations: TrustRecommendation[];
  gpsHighlights: GpsSession[];
  isPublic: boolean;
  /** Server-set for minors; replaces any age detail on the public Passport. */
  ageGroupLabel?: 'youth' | null;
  /** Player-added links, only as projected by the server for the public Passport. */
  footballSources?: PublicFootballSource[];
};

export type PublicPortfolioSectionKey =
  | 'careerTimeline'
  | 'statistics'
  | 'videos'
  | 'achievements'
  | 'recommendations'
  | 'gpsHighlights'
  | 'performanceCharts';

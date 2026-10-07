import { type PlayerProfile } from '@/features/player-profile/types';
import { type PrivacySettings } from '@/features/player-profile/types/privacySettings';
import { type TrustRecommendation } from '@/features/trust-system/types';
import { type GpsSession } from '@/features/gps/types';

export type PublicPortfolioData = {
  playerId: string;
  profile: PlayerProfile;
  privacy: PrivacySettings;
  recommendations: TrustRecommendation[];
  gpsHighlights: GpsSession[];
  isPublic: boolean;
  /** Server-set for minors; replaces any age detail on the public Passport. */
  ageGroupLabel?: 'youth' | null;
};

export type PublicPortfolioSectionKey =
  | 'careerTimeline'
  | 'statistics'
  | 'videos'
  | 'achievements'
  | 'recommendations'
  | 'gpsHighlights'
  | 'performanceCharts';

import { type PlayerProfile } from '@/features/player-profile/types';
import {
  defaultPrivacySettings,
  type PrivacySettings,
} from '@/features/player-profile/types/privacySettings';
import { parsePrivacySettings } from '@/features/player-profile/models/PrivacySettingsModel';
import { type PublicPortfolioData, type PublicPortfolioSectionKey } from '@/features/public-portfolio/types';

export function isPortfolioSectionVisible(
  privacy: PrivacySettings,
  section: PublicPortfolioSectionKey,
): boolean {
  if (!privacy.publicPortfolioEnabled) {
    return false;
  }

  switch (section) {
    case 'careerTimeline':
      return privacy.showCareerTimeline;
    case 'statistics':
      return privacy.showStatistics;
    case 'videos':
      return privacy.showVideos;
    case 'achievements':
      return privacy.showAchievements;
    case 'recommendations':
      return privacy.showRecommendations;
    case 'gpsHighlights':
      return privacy.showGpsHighlights;
    case 'performanceCharts':
      return privacy.showPerformanceCharts;
    default:
      return false;
  }
}

export function buildPublicPortfolioData(
  profile: PlayerProfile,
  recommendations: PublicPortfolioData['recommendations'] = [],
  gpsHighlights: PublicPortfolioData['gpsHighlights'] = [],
): PublicPortfolioData {
  const privacy = profile.privacy ?? defaultPrivacySettings();

  return {
    playerId: profile.id,
    profile,
    privacy,
    recommendations,
    gpsHighlights,
    isPublic: privacy.publicPortfolioEnabled,
  };
}

export function parsePortfolioPrivacyFromProfile(profile: PlayerProfile): PrivacySettings {
  return parsePrivacySettings(profile.privacy);
}

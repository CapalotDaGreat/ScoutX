import { type PlayerProfile } from '@/features/player-profile/types';
import {
  defaultPrivacySettings,
  type PrivacySettings,
} from '@/features/player-profile/types/privacySettings';
import { parsePrivacySettings } from '@/features/player-profile/models/PrivacySettingsModel';
import { type TrustRecommendation } from '@/features/trust-system/types';
import { type PublicPortfolioData, type PublicPortfolioSectionKey } from '@/features/public-portfolio/types';

export function filterVisibleRecommendations(
  recommendations: TrustRecommendation[],
  hiddenIds?: string[],
): TrustRecommendation[] {
  if (!hiddenIds?.length) {
    return recommendations;
  }
  const hidden = new Set(hiddenIds);
  return recommendations.filter((item) => !hidden.has(item.id));
}

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
    recommendations: filterVisibleRecommendations(recommendations, profile.hiddenEndorsementIds),
    gpsHighlights,
    isPublic: privacy.publicPortfolioEnabled,
  };
}

/**
 * Stranger-view / export projection: omit sections the player hid and refuse private Passports.
 * Image/PDF exports must call this so downloads never outrun on-screen privacy toggles.
 */
export function filterPortfolioForPublicExport(data: PublicPortfolioData): PublicPortfolioData | null {
  if (!data.isPublic || !data.privacy.publicPortfolioEnabled) {
    return null;
  }
  const privacy = data.privacy;
  const profile = { ...data.profile };
  if (!isPortfolioSectionVisible(privacy, 'statistics')) {
    profile.statisticsMatches = [];
  }
  if (!isPortfolioSectionVisible(privacy, 'recommendations')) {
    return {
      ...data,
      profile,
      recommendations: [],
      gpsHighlights: isPortfolioSectionVisible(privacy, 'gpsHighlights') ? data.gpsHighlights : [],
    };
  }
  return {
    ...data,
    profile,
    recommendations: filterVisibleRecommendations(data.recommendations, profile.hiddenEndorsementIds),
    gpsHighlights: isPortfolioSectionVisible(privacy, 'gpsHighlights') ? data.gpsHighlights : [],
  };
}

export function parsePortfolioPrivacyFromProfile(profile: PlayerProfile): PrivacySettings {
  return parsePrivacySettings(profile.privacy);
}

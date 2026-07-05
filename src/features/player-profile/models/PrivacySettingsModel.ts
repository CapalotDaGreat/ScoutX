import {
  defaultPrivacySettings,
  type PrivacySettings,
} from '@/features/player-profile/types/privacySettings';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readBool(record: Record<string, unknown>, key: keyof PrivacySettings, fallback: boolean): boolean {
  const value = record[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function parsePrivacySettings(value: unknown): PrivacySettings {
  const defaults = defaultPrivacySettings();
  const record = asRecord(value);
  if (!record) {
    return defaults;
  }

  return {
    publicPortfolioEnabled: readBool(record, 'publicPortfolioEnabled', defaults.publicPortfolioEnabled),
    discoverableByScouts: readBool(record, 'discoverableByScouts', defaults.discoverableByScouts),
    showCareerTimeline: readBool(record, 'showCareerTimeline', defaults.showCareerTimeline),
    showStatistics: readBool(record, 'showStatistics', defaults.showStatistics),
    showVideos: readBool(record, 'showVideos', defaults.showVideos),
    showAchievements: readBool(record, 'showAchievements', defaults.showAchievements),
    showRecommendations: readBool(record, 'showRecommendations', defaults.showRecommendations),
    showGpsHighlights: readBool(record, 'showGpsHighlights', defaults.showGpsHighlights),
    showPerformanceCharts: readBool(record, 'showPerformanceCharts', defaults.showPerformanceCharts),
    allowSocialPostsInFeed: readBool(record, 'allowSocialPostsInFeed', defaults.allowSocialPostsInFeed),
  };
}

export function serializePrivacySettings(settings: PrivacySettings): Record<string, boolean> {
  return { ...settings };
}

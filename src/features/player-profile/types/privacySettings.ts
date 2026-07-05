/** Single privacy object — reused for portfolio visibility and social post visibility. */
export type PrivacySettings = {
  /** Opt-in public shareable portfolio (link / QR). */
  publicPortfolioEnabled: boolean;
  /** When true, profile appears in signed-in scout discovery search. */
  discoverableByScouts: boolean;
  showCareerTimeline: boolean;
  showStatistics: boolean;
  showVideos: boolean;
  showAchievements: boolean;
  showRecommendations: boolean;
  showGpsHighlights: boolean;
  showPerformanceCharts: boolean;
  /** When false, social posts are hidden from public feeds. */
  allowSocialPostsInFeed: boolean;
};

export const defaultPrivacySettings = (): PrivacySettings => ({
  publicPortfolioEnabled: false,
  discoverableByScouts: false,
  showCareerTimeline: true,
  showStatistics: true,
  showVideos: true,
  showAchievements: true,
  showRecommendations: true,
  showGpsHighlights: true,
  showPerformanceCharts: true,
  allowSocialPostsInFeed: true,
});

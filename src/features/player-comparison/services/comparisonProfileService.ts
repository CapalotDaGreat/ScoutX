import type {
  ComparisonCareerSummary,
  ComparisonGpsSummary,
  ComparisonPlayerProfile,
  ComparisonTrendPoint,
  ComparisonVideoSummary,
} from '@/features/player-comparison/types';
import type { DiscoverablePlayer } from '@/features/scout-discovery/types';

function formPoints(result: 'W' | 'D' | 'L'): number {
  return result === 'W' ? 3 : result === 'D' ? 1 : 0;
}

/**
 * Recent form points (win 3, draw 1, loss 0) from recorded results only. Other stats are
 * different units and belong in the metric tables, not on the same line.
 */
function buildPerformanceTrend(player: DiscoverablePlayer): ComparisonTrendPoint[] {
  return player.form
    .map((result, index) => ({
      label: String(index + 1),
      values: { [player.id]: formPoints(result) },
    }))
    .slice(-5);
}

/**
 * GPS summaries only exist when the discovery projection carries GPS-derived values.
 * `distanceKm` on a discoverable player is the scout's distance to the player, not a
 * running distance, so it is never used here.
 */
function buildGpsSummary(player: DiscoverablePlayer): ComparisonGpsSummary | null {
  if (player.sprintSpeedKmh === null) {
    return null;
  }
  return {
    playerId: player.id,
    distanceKm: null,
    sprintSpeedKmh: player.sprintSpeedKmh,
    sessionsCount: null,
    topSpeedKmh: null,
  };
}

function buildVideoSummary(player: DiscoverablePlayer): ComparisonVideoSummary | null {
  if (!player.hasHighlightVideos) {
    return null;
  }
  // The discovery projection only knows that videos exist, not how many or which.
  return {
    playerId: player.id,
    videoCount: null,
    featuredTitle: null,
    categories: [],
  };
}

function buildCareerSummary(player: DiscoverablePlayer): ComparisonCareerSummary {
  return {
    playerId: player.id,
    clubs: player.clubHistory.map((entry) => entry.club),
    achievements: player.achievements,
    journeyMilestones: null,
  };
}

export function buildComparisonProfile(player: DiscoverablePlayer): ComparisonPlayerProfile {
  return {
    player,
    radarStats: player.radarStats,
    performanceTrend: buildPerformanceTrend(player),
    gps: buildGpsSummary(player),
    videos: buildVideoSummary(player),
    career: buildCareerSummary(player),
  };
}

export function buildComparisonProfiles(
  players: DiscoverablePlayer[],
): ComparisonPlayerProfile[] {
  return players.map(buildComparisonProfile);
}

export function mergeTrendPoints(
  profiles: ComparisonPlayerProfile[],
): ComparisonTrendPoint[] {
  const trendMap = new Map<string, Record<string, number>>();

  for (const profile of profiles) {
    for (const point of profile.performanceTrend) {
      const current = trendMap.get(point.label) ?? {};
      trendMap.set(point.label, { ...current, ...point.values });
    }
  }

  return Array.from(trendMap.entries()).map(([label, values]) => ({ label, values }));
}

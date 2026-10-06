import {
  type ComparisonCareerSummary,
  type ComparisonGpsSummary,
  type ComparisonPlayerProfile,
  type ComparisonTrendPoint,
  type ComparisonVideoSummary,
} from '@/features/player-comparison/types';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';

function formPoints(result: 'W' | 'D' | 'L'): number {
  return result === 'W' ? 3 : result === 'D' ? 1 : 0;
}

/**
 * Trend points derived only from recorded data: recent form results, per-match goal and
 * assist averages, and the rolling form average. Nothing here is seeded or guessed.
 */
function buildPerformanceTrend(player: DiscoverablePlayer): ComparisonTrendPoint[] {
  const formValues = player.form.map((result, index) => ({
    label: `M${index + 1}`,
    values: { [player.id]: formPoints(result) },
  }));

  const rolling = player.form.map((_result, index) => {
    const slice = player.form.slice(0, index + 1);
    const total = slice.reduce((sum, item) => sum + formPoints(item), 0);
    const avg = total / slice.length;
    return { label: `Form ${index + 1}`, values: { [player.id]: Number(avg.toFixed(2)) } };
  });

  const perMatch: ComparisonTrendPoint[] =
    player.matchCount > 0
      ? [
          {
            label: 'Goals/match',
            values: { [player.id]: Number((player.goals / player.matchCount).toFixed(2)) },
          },
          {
            label: 'Assists/match',
            values: { [player.id]: Number((player.assists / player.matchCount).toFixed(2)) },
          },
        ]
      : [];

  return [...formValues.slice(-5), ...perMatch, ...rolling.slice(-3)];
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

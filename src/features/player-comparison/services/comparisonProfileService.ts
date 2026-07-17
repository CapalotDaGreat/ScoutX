import {
  type ComparisonCareerSummary,
  type ComparisonGpsSummary,
  type ComparisonPlayerProfile,
  type ComparisonTrendPoint,
  type ComparisonVideoSummary,
} from '@/features/player-comparison/types';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';

function seedFromId(playerId: string): number {
  return playerId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function buildPerformanceTrend(player: DiscoverablePlayer): ComparisonTrendPoint[] {
  const formValues = player.form.map((result, index) => {
    const points = result === 'W' ? 3 : result === 'D' ? 1 : 0;
    return { label: `M${index + 1}`, values: { [player.id]: points } };
  });

  const rolling = player.form.map((_result, index) => {
    const slice = player.form.slice(0, index + 1);
    const total = slice.reduce((sum, item) => sum + (item === 'W' ? 3 : item === 'D' ? 1 : 0), 0);
    const avg = total / slice.length;
    return { label: `Form ${index + 1}`, values: { [player.id]: Number(avg.toFixed(2)) } };
  });

  return [
    ...formValues.slice(-5),
    {
      label: 'Goals/90',
      values: { [player.id]: Number((player.goals / Math.max(player.matchCount, 1)).toFixed(2)) },
    },
    {
      label: 'Assists/90',
      values: { [player.id]: Number((player.assists / Math.max(player.matchCount, 1)).toFixed(2)) },
    },
    ...rolling.slice(-3),
  ];
}

function buildGpsSummary(player: DiscoverablePlayer): ComparisonGpsSummary {
  const seed = seedFromId(player.id);
  return {
    playerId: player.id,
    distanceKm: player.distanceKm ?? 10 + (seed % 5),
    sprintSpeedKmh: player.sprintSpeedKmh,
    sessionsCount: 4 + (seed % 8),
    topSpeedKmh: Number((player.sprintSpeedKmh + 0.4).toFixed(1)),
  };
}

function buildVideoSummary(player: DiscoverablePlayer): ComparisonVideoSummary {
  const seed = seedFromId(player.id);
  const categories = player.hasHighlightVideos
    ? ['goals', 'skills', 'assists'].slice(0, 1 + (seed % 3))
    : [];

  return {
    playerId: player.id,
    videoCount: player.hasHighlightVideos ? 2 + (seed % 5) : 0,
    featuredTitle: player.hasHighlightVideos ? `${player.fullName} — Match Highlights` : 'No videos',
    categories,
  };
}

function buildCareerSummary(player: DiscoverablePlayer): ComparisonCareerSummary {
  const seed = seedFromId(player.id);
  return {
    playerId: player.id,
    clubs: player.clubHistory.map((entry) => entry.club),
    achievements: player.achievements,
    journeyMilestones: 3 + (seed % 6),
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

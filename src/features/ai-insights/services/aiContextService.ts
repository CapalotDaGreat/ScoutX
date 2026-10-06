import { type GpsSession } from '@/features/gps/types';
import { type JourneyEntry } from '@/features/football-journey/types';
import { type HighlightVideo } from '@/features/highlight-videos/types';
import {
  type AiInsightContext,
  type AiPlayerContext,
  type AiStatisticsContext,
} from '@/features/ai-insights/types';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';
import { averageOfRecorded } from '@/features/player-statistics/utils/recordedStats';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';

export function playerContextFromDiscoverable(player: DiscoverablePlayer): AiPlayerContext {
  return {
    playerId: player.id,
    playerName: player.fullName,
    position: player.position,
    age: player.age,
    club: player.club,
    nationality: player.nationality,
  };
}

export function statisticsContextFromMatches(
  matches: PlayerMatchStatistics[],
): AiStatisticsContext | undefined {
  if (matches.length === 0) {
    return undefined;
  }

  const totals = matches.reduce(
    (acc, match) => ({
      goals: acc.goals + match.goals,
      assists: acc.assists + match.assists,
      minutes: acc.minutes + match.minutes,
      shots: acc.shots + match.shots,
      tackles: acc.tackles + match.tackles,
    }),
    { goals: 0, assists: 0, minutes: 0, shots: 0, tackles: 0 },
  );

  const matchCount = matches.length;
  const averages: Record<string, number> = {
    goals: Number((totals.goals / matchCount).toFixed(2)),
    assists: Number((totals.assists / matchCount).toFixed(2)),
    minutes: Number((totals.minutes / matchCount).toFixed(0)),
  };
  const passAccuracy = averageOfRecorded(matches, 'passAccuracy');
  if (passAccuracy !== null) {
    averages.passAccuracy = Number(passAccuracy.toFixed(1));
  }

  return {
    matchCount,
    totals,
    averages,
    recentResults: matches.slice(0, 5).map((match) => match.result),
  };
}

export function gpsSessionsFromRecords(sessions: GpsSession[]) {
  return sessions.map((session) => ({
    matchLabel: session.matchLabel,
    distanceKm: Number((session.metrics.distanceM / 1000).toFixed(2)),
    maxSpeedKmh: session.metrics.maxSpeedKmh,
    avgSpeedKmh: session.metrics.avgSpeedKmh,
    sprintCount: session.metrics.sprintCount,
    durationMin: Math.round(session.metrics.durationSec / 60),
  }));
}

export function videosFromLibrary(videos: HighlightVideo[]) {
  return videos.map((video) => ({
    title: video.title,
    category: video.category,
    durationSec: video.durationSec,
    description: video.description,
  }));
}

export function journeyFromEntries(entries: JourneyEntry[]) {
  return entries.slice(0, 12).map((entry) => ({
    title: entry.title,
    type: entry.type,
    date: entry.date,
    organization: entry.organization,
  }));
}

export function serializeInsightContext(context: AiInsightContext): string {
  return JSON.stringify(context, null, 2);
}

export function buildPerformanceContext(
  player: AiPlayerContext,
  matches: PlayerMatchStatistics[],
): AiInsightContext {
  return {
    player,
    statistics: statisticsContextFromMatches(matches),
    ratings: undefined,
  };
}

export function buildGpsInsightContext(
  player: AiPlayerContext,
  sessions: GpsSession[],
): AiInsightContext {
  return {
    player,
    gpsSessions: gpsSessionsFromRecords(sessions),
  };
}

export function buildVideoInsightContext(
  player: AiPlayerContext,
  videos: HighlightVideo[],
): AiInsightContext {
  return {
    player,
    videos: videosFromLibrary(videos),
  };
}

export function buildCareerInsightContext(
  player: AiPlayerContext,
  entries: JourneyEntry[],
): AiInsightContext {
  return {
    player,
    journey: journeyFromEntries(entries),
  };
}

export function buildPotentialContext(
  player: AiPlayerContext,
  matches: PlayerMatchStatistics[],
  ratings?: { overallRating?: number; potentialRating?: number },
): AiInsightContext {
  return {
    player,
    statistics: statisticsContextFromMatches(matches),
    ratings,
  };
}

import { type DiscoverablePlayer, type RadarStat } from '@/features/scout-discovery/types';

export type ComparisonTrendPoint = {
  /** 1-based index of the recent match, oldest first. */
  label: string;
  values: Record<string, number>;
};

/** Nullable fields mean "unknown to the discovery projection"; never substitute defaults. */
export type ComparisonVideoSummary = {
  playerId: string;
  videoCount: number | null;
  featuredTitle: string | null;
  categories: string[];
};

export type ComparisonGpsSummary = {
  playerId: string;
  distanceKm: number | null;
  sprintSpeedKmh: number | null;
  sessionsCount: number | null;
  topSpeedKmh: number | null;
};

export type ComparisonCareerSummary = {
  playerId: string;
  clubs: string[];
  achievements: string[];
  journeyMilestones: number | null;
};

export type ComparisonPlayerProfile = {
  player: DiscoverablePlayer;
  radarStats: RadarStat[];
  performanceTrend: ComparisonTrendPoint[];
  /** Null when no GPS-derived data exists for this player. */
  gps: ComparisonGpsSummary | null;
  /** Null when the player has no highlight videos on file. */
  videos: ComparisonVideoSummary | null;
  career: ComparisonCareerSummary;
};

export type ComparisonMetricValue = {
  playerId: string;
  display: string;
  numeric?: number;
};

export type ComparisonMetricKey =
  | 'goals'
  | 'assists'
  | 'matches'
  | 'height'
  | 'weight'
  | 'sprint'
  | 'weakFoot'
  | 'skillMoves'
  | 'passing'
  | 'shooting'
  | 'defending'
  | 'physical'
  | 'distance'
  | 'topSpeed'
  | 'sessions';

export type ComparisonMetricRow = {
  key: ComparisonMetricKey;
  values: ComparisonMetricValue[];
  higherIsBetter: boolean;
};

export type ComparisonSectionKey =
  | 'radar'
  | 'statistics'
  | 'trends'
  | 'physical'
  | 'technical'
  | 'gps'
  | 'career'
  | 'videos'
  | 'achievements';

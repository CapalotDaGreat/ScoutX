import { type DiscoverablePlayer, type RadarStat } from '@/features/scout-discovery/types';

export type ComparisonTrendPoint = {
  label: string;
  values: Record<string, number>;
};

export type ComparisonVideoSummary = {
  playerId: string;
  videoCount: number;
  featuredTitle: string;
  categories: string[];
};

export type ComparisonGpsSummary = {
  playerId: string;
  distanceKm: number;
  sprintSpeedKmh: number;
  sessionsCount: number;
  topSpeedKmh: number;
};

export type ComparisonCareerSummary = {
  playerId: string;
  clubs: string[];
  achievements: string[];
  journeyMilestones: number;
};

export type ComparisonPlayerProfile = {
  player: DiscoverablePlayer;
  radarStats: RadarStat[];
  performanceTrend: ComparisonTrendPoint[];
  gps: ComparisonGpsSummary;
  videos: ComparisonVideoSummary;
  career: ComparisonCareerSummary;
};

export type ComparisonMetricValue = {
  playerId: string;
  display: string;
  numeric?: number;
};

export type ComparisonMetricRow = {
  key: string;
  label: string;
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

export type GpsSessionStatus = 'idle' | 'recording' | 'paused' | 'completed';

export type GpsPoint = {
  latitude: number;
  longitude: number;
  timestamp: number;
  speed: number;
  accuracy: number;
};

/** Compact serialized point: [lat, lng, timestamp, speed] */
export type CompactGpsPoint = [number, number, number, number];

export type MovementZoneKey = 'defensive' | 'middle' | 'attacking';

export type MovementZone = {
  zone: MovementZoneKey;
  label: string;
  percentage: number;
  durationSec: number;
};

export type HeatmapCell = {
  row: number;
  col: number;
  intensity: number;
};

export type HeatmapGrid = {
  rows: number;
  cols: number;
  cells: HeatmapCell[];
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
};

export type GpsSessionMetrics = {
  distanceM: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  sprintCount: number;
  durationSec: number;
  activeDurationSec: number;
  pointCount: number;
};

export type GpsSession = {
  id: string;
  playerId: string;
  matchLabel: string;
  status: GpsSessionStatus;
  startedAt: string;
  endedAt: string | null;
  pausedDurationMs: number;
  metrics: GpsSessionMetrics;
  zones: MovementZone[];
  heatmap: HeatmapGrid;
  pointsStorageKey: string | null;
};

export type GpsTrackingState = {
  status: GpsSessionStatus;
  matchLabel: string;
  startedAt: number | null;
  pausedAt: number | null;
  pausedDurationMs: number;
  pointCount: number;
  liveMetrics: GpsSessionMetrics;
};

export type GpsSessionSummary = Pick<
  GpsSession,
  'id' | 'matchLabel' | 'startedAt' | 'endedAt' | 'metrics' | 'zones'
>;

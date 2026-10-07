export type GpsSessionStatus = 'idle' | 'recording' | 'paused' | 'completed';

/**
 * A movement sample in a session-local frame. x/y are metres from the first fix of the
 * segment and elapsedMs counts from session start. Latitude, longitude and wall-clock fix
 * times never leave gpsTrackingService, so nothing stored or uploaded can locate the player.
 */
export type GpsPoint = {
  x: number;
  y: number;
  elapsedMs: number;
  speed: number;
  accuracy: number;
  /** Increments when the local frame restarts (e.g. app relaunch mid-session). */
  segment: number;
};

/** Compact serialized point: [x, y, elapsedMs, speed, accuracy, segment] */
export type CompactGpsPoint = [number, number, number, number, number, number];

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
  /** Size of the movement area in metres, aligned to the player's main movement axis. */
  extent: { lengthM: number; widthM: number };
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

export type SpeedBand = 'walk' | 'jog' | 'run' | 'sprint';

/** Sprint window in seconds since session start. */
export type GpsSprint = { startSec: number; endSec: number; peakKmh: number };

export type GpsIntelligence = {
  status: 'ok' | 'insufficient' | 'low_accuracy';
  sample: { points: number; durationSec: number; medianAccuracyM: number | null };
  /** Spread of the movement area across and along its main axis (5th–95th percentile). */
  widthM: number | null;
  depthM: number | null;
  /** Time in the central third of the movement axis vs either end. Pitch direction is unknown. */
  centralSharePct: number | null;
  bands: Record<SpeedBand, number> | null;
  sprints: GpsSprint[];
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
  /** Computed on device at session end; null for sessions saved before it existed. */
  intelligence: GpsIntelligence | null;
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

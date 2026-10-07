/** Battery-optimized tracking: update only every 5s or 5m movement */
export const GPS_TRACKING_CONFIG = {
  accuracy: 'balanced' as const,
  timeIntervalMs: 5000,
  distanceIntervalM: 5,
  minPointDistanceM: 3,
  maxPointIntervalMs: 15000,
  sprintSpeedMs: 7,
  sprintMinDurationSec: 1,
  heatmapRows: 14,
  heatmapCols: 20,
  autosaveIntervalMs: 30000,
  maxStoredPoints: 5000,
} as const;

export const MOVEMENT_ZONE_LABELS: Record<string, string> = {
  defensive: 'Defensive Third',
  middle: 'Middle Third',
  attacking: 'Attacking Third',
};

export const GPS_STORAGE_KEYS = {
  activeSession: '@scoutx/gps/active-session',
  legacyActivePoints: '@scoutx/gps/active-points',
  localSessions: '@scoutx/gps/sessions',
  legacyPurged: '@scoutx/gps/legacy-location-purged',
} as const;

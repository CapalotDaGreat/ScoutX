import { GPS_TRACKING_CONFIG } from '@/features/gps/constants';
import {
  type GpsSession,
  type GpsSessionMetrics,
  type GpsSessionStatus,
  type HeatmapGrid,
  type MovementZone,
} from '@/features/gps/types';

export function createEmptyHeatmap(): HeatmapGrid {
  return {
    rows: GPS_TRACKING_CONFIG.heatmapRows,
    cols: GPS_TRACKING_CONFIG.heatmapCols,
    cells: [],
    bounds: {
      minLat: 0,
      maxLat: 0,
      minLng: 0,
      maxLng: 0,
    },
  };
}

export function createEmptyMetrics(): GpsSessionMetrics {
  return {
    distanceM: 0,
    avgSpeedKmh: 0,
    maxSpeedKmh: 0,
    sprintCount: 0,
    durationSec: 0,
    activeDurationSec: 0,
    pointCount: 0,
  };
}

export function createGpsSessionId(): string {
  return `gps-${Date.now()}`;
}

export function createGpsSession(params: {
  id: string;
  playerId: string;
  matchLabel: string;
  status?: GpsSessionStatus;
}): GpsSession {
  return {
    id: params.id,
    playerId: params.playerId,
    matchLabel: params.matchLabel,
    status: params.status ?? 'recording',
    startedAt: new Date().toISOString(),
    endedAt: null,
    pausedDurationMs: 0,
    metrics: createEmptyMetrics(),
    zones: [],
    heatmap: createEmptyHeatmap(),
    pointsStorageKey: null,
  };
}

export function finalizeGpsSession(
  session: GpsSession,
  metrics: GpsSessionMetrics,
  zones: MovementZone[],
  heatmap: HeatmapGrid,
  pointsStorageKey: string | null,
): GpsSession {
  return {
    ...session,
    status: 'completed',
    endedAt: new Date().toISOString(),
    metrics,
    zones,
    heatmap,
    pointsStorageKey,
  };
}

import { GPS_TRACKING_CONFIG, MOVEMENT_ZONE_LABELS } from '@/features/gps/constants';
import { createEmptyHeatmap, createEmptyMetrics } from '@/features/gps/models/GpsSessionModel';
import {
  type GpsPoint,
  type GpsSessionMetrics,
  type HeatmapCell,
  type HeatmapGrid,
  type MovementZone,
  type MovementZoneKey,
} from '@/features/gps/types';

export { createEmptyMetrics } from '@/features/gps/models/GpsSessionModel';

const EARTH_RADIUS_M = 6_371_000;

export function haversineDistanceM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function metersPerSecondToKmh(speedMs: number): number {
  return speedMs * 3.6;
}

function calculateSprintCount(points: GpsPoint[]): number {
  if (points.length < 2) {
    return 0;
  }

  let sprintCount = 0;
  let sprintStart: number | null = null;

  for (const point of points) {
    const isSprinting = point.speed >= GPS_TRACKING_CONFIG.sprintSpeedMs;

    if (isSprinting && sprintStart === null) {
      sprintStart = point.timestamp;
      continue;
    }

    if (!isSprinting && sprintStart !== null) {
      const durationSec = (point.timestamp - sprintStart) / 1000;
      if (durationSec >= GPS_TRACKING_CONFIG.sprintMinDurationSec) {
        sprintCount += 1;
      }
      sprintStart = null;
    }
  }

  if (sprintStart !== null && points.length > 0) {
    const lastPoint = points[points.length - 1];
    const durationSec = (lastPoint.timestamp - sprintStart) / 1000;
    if (durationSec >= GPS_TRACKING_CONFIG.sprintMinDurationSec) {
      sprintCount += 1;
    }
  }

  return sprintCount;
}

export function calculateSessionMetrics(
  points: GpsPoint[],
  pausedDurationMs: number,
): GpsSessionMetrics {
  if (points.length === 0) {
    return createEmptyMetrics();
  }

  let distanceM = 0;
  let maxSpeedMs = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    distanceM += haversineDistanceM(
      previous.latitude,
      previous.longitude,
      current.latitude,
      current.longitude,
    );
    maxSpeedMs = Math.max(maxSpeedMs, current.speed);
  }

  maxSpeedMs = Math.max(maxSpeedMs, points[0].speed);

  const startedAt = points[0].timestamp;
  const endedAt = points[points.length - 1].timestamp;
  const durationSec = Math.max((endedAt - startedAt - pausedDurationMs) / 1000, 0);
  const activeDurationSec = durationSec;
  const avgSpeedMs = activeDurationSec > 0 ? distanceM / activeDurationSec : 0;

  return {
    distanceM: Math.round(distanceM),
    avgSpeedKmh: Number(metersPerSecondToKmh(avgSpeedMs).toFixed(1)),
    maxSpeedKmh: Number(metersPerSecondToKmh(maxSpeedMs).toFixed(1)),
    sprintCount: calculateSprintCount(points),
    durationSec: Math.round(durationSec),
    activeDurationSec: Math.round(activeDurationSec),
    pointCount: points.length,
  };
}

function getZoneKey(normalizedLng: number): MovementZoneKey {
  if (normalizedLng < 0.33) {
    return 'defensive';
  }

  if (normalizedLng < 0.66) {
    return 'middle';
  }

  return 'attacking';
}

export function calculateMovementZones(points: GpsPoint[]): MovementZone[] {
  if (points.length < 2) {
    return (['defensive', 'middle', 'attacking'] as MovementZoneKey[]).map((zone) => ({
      zone,
      label: MOVEMENT_ZONE_LABELS[zone],
      percentage: 0,
      durationSec: 0,
    }));
  }

  const minLng = Math.min(...points.map((point) => point.longitude));
  const maxLng = Math.max(...points.map((point) => point.longitude));
  const lngRange = Math.max(maxLng - minLng, 0.00001);

  const zoneDurations: Record<MovementZoneKey, number> = {
    defensive: 0,
    middle: 0,
    attacking: 0,
  };

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const normalizedLng = (previous.longitude - minLng) / lngRange;
    const zone = getZoneKey(normalizedLng);
    const segmentDurationSec = Math.max((current.timestamp - previous.timestamp) / 1000, 0);
    zoneDurations[zone] += segmentDurationSec;
  }

  const totalDuration = Object.values(zoneDurations).reduce((sum, value) => sum + value, 0);

  return (['defensive', 'middle', 'attacking'] as MovementZoneKey[]).map((zone) => {
    const durationSec = Math.round(zoneDurations[zone]);
    const percentage =
      totalDuration > 0 ? Math.round((zoneDurations[zone] / totalDuration) * 100) : 0;

    return {
      zone,
      label: MOVEMENT_ZONE_LABELS[zone],
      percentage,
      durationSec,
    };
  });
}

export function generateHeatmapGrid(points: GpsPoint[]): HeatmapGrid {
  const heatmap = createEmptyHeatmap();

  if (points.length === 0) {
    return heatmap;
  }

  const minLat = Math.min(...points.map((point) => point.latitude));
  const maxLat = Math.max(...points.map((point) => point.latitude));
  const minLng = Math.min(...points.map((point) => point.longitude));
  const maxLng = Math.max(...points.map((point) => point.longitude));

  const latRange = Math.max(maxLat - minLat, 0.00005);
  const lngRange = Math.max(maxLng - minLng, 0.00005);

  const counts = Array.from({ length: heatmap.rows * heatmap.cols }, () => 0);

  for (const point of points) {
    const row = Math.min(
      heatmap.rows - 1,
      Math.floor(((point.latitude - minLat) / latRange) * heatmap.rows),
    );
    const col = Math.min(
      heatmap.cols - 1,
      Math.floor(((point.longitude - minLng) / lngRange) * heatmap.cols),
    );
    const index = row * heatmap.cols + col;
    counts[index] += 1;
  }

  const maxCount = Math.max(...counts, 1);
  const cells: HeatmapCell[] = counts
    .map((count, index) => ({
      row: Math.floor(index / heatmap.cols),
      col: index % heatmap.cols,
      intensity: count > 0 ? Number((count / maxCount).toFixed(3)) : 0,
    }))
    .filter((cell) => cell.intensity > 0);

  return {
    rows: heatmap.rows,
    cols: heatmap.cols,
    cells,
    bounds: { minLat, maxLat, minLng, maxLng },
  };
}

export function shouldAcceptPoint(
  lastPoint: GpsPoint | null,
  nextPoint: GpsPoint,
): boolean {
  if (!lastPoint) {
    return true;
  }

  const distanceM = haversineDistanceM(
    lastPoint.latitude,
    lastPoint.longitude,
    nextPoint.latitude,
    nextPoint.longitude,
  );
  const elapsedMs = nextPoint.timestamp - lastPoint.timestamp;

  return (
    distanceM >= GPS_TRACKING_CONFIG.minPointDistanceM ||
    elapsedMs >= GPS_TRACKING_CONFIG.maxPointIntervalMs
  );
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }

  return `${Math.round(meters)} m`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatSpeed(kmh: number): string {
  return `${kmh.toFixed(1)} km/h`;
}

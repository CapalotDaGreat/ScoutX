import { GPS_TRACKING_CONFIG, MOVEMENT_ZONE_LABELS } from '@/features/gps/constants';
import { createEmptyHeatmap, createEmptyMetrics } from '@/features/gps/models/GpsSessionModel';
import type {
  GpsPoint,
  GpsSessionMetrics,
  HeatmapCell,
  HeatmapGrid,
  MovementZone,
  MovementZoneKey,
} from '@/features/gps/types';

export { createEmptyMetrics } from '@/features/gps/models/GpsSessionModel';

export function localDistanceM(a: GpsPoint, b: GpsPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Distance between consecutive points; frames from different segments are not comparable. */
function stepDistanceM(previous: GpsPoint, current: GpsPoint): number {
  return previous.segment === current.segment ? localDistanceM(previous, current) : 0;
}

/**
 * Rotates points onto the player's main movement axis, which on a pitch is close to its
 * length. GPS alone cannot know which end is which, so direction is arbitrary.
 */
export function alignToMainAxis(points: readonly GpsPoint[]): { along: number; across: number }[] {
  if (points.length === 0) return [];
  const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const point of points) {
    const dx = point.x - cx;
    const dy = point.y - cy;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  return points.map((point) => {
    const dx = point.x - cx;
    const dy = point.y - cy;
    return { along: dx * ux + dy * uy, across: -dx * uy + dy * ux };
  });
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
      sprintStart = point.elapsedMs;
      continue;
    }

    if (!isSprinting && sprintStart !== null) {
      const durationSec = (point.elapsedMs - sprintStart) / 1000;
      if (durationSec >= GPS_TRACKING_CONFIG.sprintMinDurationSec) {
        sprintCount += 1;
      }
      sprintStart = null;
    }
  }

  if (sprintStart !== null && points.length > 0) {
    const lastPoint = points[points.length - 1];
    const durationSec = (lastPoint.elapsedMs - sprintStart) / 1000;
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
  let maxSpeedMs = points[0].speed;

  for (let index = 1; index < points.length; index += 1) {
    distanceM += stepDistanceM(points[index - 1], points[index]);
    maxSpeedMs = Math.max(maxSpeedMs, points[index].speed);
  }

  const startedAt = points[0].elapsedMs;
  const endedAt = points[points.length - 1].elapsedMs;
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

function getZoneKey(normalized: number): MovementZoneKey {
  if (normalized < 0.33) {
    return 'defensive';
  }

  if (normalized < 0.66) {
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

  const along = alignToMainAxis(points).map((point) => point.along);
  const minAlong = Math.min(...along);
  const range = Math.max(Math.max(...along) - minAlong, 0.5);

  const zoneDurations: Record<MovementZoneKey, number> = {
    defensive: 0,
    middle: 0,
    attacking: 0,
  };

  for (let index = 1; index < points.length; index += 1) {
    const zone = getZoneKey((along[index - 1] - minAlong) / range);
    const segmentDurationSec = Math.max((points[index].elapsedMs - points[index - 1].elapsedMs) / 1000, 0);
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

  const aligned = alignToMainAxis(points);
  const minAlong = Math.min(...aligned.map((point) => point.along));
  const maxAlong = Math.max(...aligned.map((point) => point.along));
  const minAcross = Math.min(...aligned.map((point) => point.across));
  const maxAcross = Math.max(...aligned.map((point) => point.across));
  const lengthRange = Math.max(maxAlong - minAlong, 5);
  const widthRange = Math.max(maxAcross - minAcross, 5);

  const counts = Array.from({ length: heatmap.rows * heatmap.cols }, () => 0);

  for (const point of aligned) {
    const row = Math.min(
      heatmap.rows - 1,
      Math.floor(((point.across - minAcross) / widthRange) * heatmap.rows),
    );
    const col = Math.min(
      heatmap.cols - 1,
      Math.floor(((point.along - minAlong) / lengthRange) * heatmap.cols),
    );
    counts[row * heatmap.cols + col] += 1;
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
    extent: { lengthM: Math.round(maxAlong - minAlong), widthM: Math.round(maxAcross - minAcross) },
  };
}

export function shouldAcceptPoint(
  lastPoint: GpsPoint | null,
  nextPoint: GpsPoint,
): boolean {
  if (!lastPoint || lastPoint.segment !== nextPoint.segment) {
    return true;
  }

  const elapsedMs = nextPoint.elapsedMs - lastPoint.elapsedMs;

  return (
    localDistanceM(lastPoint, nextPoint) >= GPS_TRACKING_CONFIG.minPointDistanceM ||
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

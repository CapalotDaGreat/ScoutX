import type { CompactGpsPoint, GpsPoint } from '@/features/gps/types';

const EARTH_RADIUS_M = 6_371_000;

export type GeoOrigin = { latitude: number; longitude: number };

/**
 * Projects a fix into metres from the segment origin (equirectangular; accurate to well
 * under a metre across a football pitch). Only gpsTrackingService holds the origin.
 */
export function toLocalPoint(
  origin: GeoOrigin,
  fix: { latitude: number; longitude: number; elapsedMs: number; speed: number; accuracy: number },
  segment: number,
): GpsPoint {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const x = toRad(fix.longitude - origin.longitude) * EARTH_RADIUS_M * Math.cos(toRad(origin.latitude));
  const y = toRad(fix.latitude - origin.latitude) * EARTH_RADIUS_M;
  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    elapsedMs: Math.max(0, Math.round(fix.elapsedMs)),
    speed: Math.max(fix.speed, 0),
    accuracy: Math.max(fix.accuracy, 0),
    segment,
  };
}

export function compactGpsPoint(point: GpsPoint): CompactGpsPoint {
  return [point.x, point.y, point.elapsedMs, point.speed, point.accuracy, point.segment];
}

export function expandGpsPoint(compact: CompactGpsPoint): GpsPoint {
  return {
    x: compact[0],
    y: compact[1],
    elapsedMs: compact[2],
    speed: compact[3],
    accuracy: compact[4],
    segment: compact[5],
  };
}

export function isCompactGpsPoint(value: unknown): value is CompactGpsPoint {
  return Array.isArray(value) && value.length === 6 && value.every((item) => typeof item === 'number');
}

export function compactGpsPoints(points: GpsPoint[]): CompactGpsPoint[] {
  return points.map(compactGpsPoint);
}

export function expandGpsPoints(compactPoints: CompactGpsPoint[]): GpsPoint[] {
  return compactPoints.map(expandGpsPoint);
}

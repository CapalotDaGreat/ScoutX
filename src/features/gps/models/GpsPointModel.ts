import {
  type CompactGpsPoint,
  type GpsPoint,
} from '@/features/gps/types';

export function createGpsPoint(
  latitude: number,
  longitude: number,
  timestamp: number,
  speed: number,
  accuracy: number,
): GpsPoint {
  return {
    latitude,
    longitude,
    timestamp,
    speed: Math.max(speed, 0),
    accuracy: Math.max(accuracy, 0),
  };
}

export function compactGpsPoint(point: GpsPoint): CompactGpsPoint {
  return [point.latitude, point.longitude, point.timestamp, point.speed];
}

export function expandGpsPoint(compact: CompactGpsPoint): GpsPoint {
  return {
    latitude: compact[0],
    longitude: compact[1],
    timestamp: compact[2],
    speed: compact[3],
    accuracy: 0,
  };
}

export function compactGpsPoints(points: GpsPoint[]): CompactGpsPoint[] {
  return points.map(compactGpsPoint);
}

export function expandGpsPoints(compactPoints: CompactGpsPoint[]): GpsPoint[] {
  return compactPoints.map(expandGpsPoint);
}

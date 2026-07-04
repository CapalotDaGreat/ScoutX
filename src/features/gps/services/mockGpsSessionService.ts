import { type GpsSession } from '@/features/gps/types';

export const mockGpsSessions: GpsSession[] = [
  {
    id: 'gps-demo-001',
    playerId: 'demo-player',
    matchLabel: 'League Match vs Rivergate',
    status: 'completed',
    startedAt: '2026-05-31T14:00:00.000Z',
    endedAt: '2026-05-31T15:30:00.000Z',
    pausedDurationMs: 120000,
    metrics: {
      distanceM: 8420,
      avgSpeedKmh: 6.8,
      maxSpeedKmh: 28.4,
      sprintCount: 14,
      durationSec: 5400,
      activeDurationSec: 5280,
      pointCount: 186,
    },
    zones: [
      { zone: 'defensive', label: 'Defensive Third', percentage: 28, durationSec: 1478 },
      { zone: 'middle', label: 'Middle Third', percentage: 44, durationSec: 2323 },
      { zone: 'attacking', label: 'Attacking Third', percentage: 28, durationSec: 1479 },
    ],
    heatmap: {
      rows: 14,
      cols: 20,
      bounds: {
        minLat: 47.376,
        maxLat: 47.378,
        minLng: 8.537,
        maxLng: 8.541,
      },
      cells: [
        { row: 4, col: 6, intensity: 0.4 },
        { row: 5, col: 7, intensity: 0.8 },
        { row: 6, col: 8, intensity: 1 },
        { row: 7, col: 9, intensity: 0.7 },
        { row: 8, col: 10, intensity: 0.5 },
      ],
    },
    pointsStorageKey: null,
  },
];

export async function getMockGpsSessions(playerId: string): Promise<GpsSession[]> {
  await new Promise((resolve) => setTimeout(resolve, 250));
  return mockGpsSessions.map((session) => ({ ...session, playerId }));
}

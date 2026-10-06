import { type PlayerMatchStatistics } from '@/features/player-statistics/types';

type OptionalMatchMetric = 'passAccuracy' | 'matchRating';

/** Average over matches where the player actually recorded the metric; null if none did. */
export function averageOfRecorded(
  matches: PlayerMatchStatistics[],
  key: OptionalMatchMetric,
): number | null {
  const values = matches
    .map((match) => match[key])
    .filter((value): value is number => typeof value === 'number');
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function formatRating(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}

import {
  type ComparisonMetricRow,
  type ComparisonMetricValue,
  type ComparisonPlayerProfile,
} from '@/features/player-comparison/types';

function metric(
  key: string,
  label: string,
  values: ComparisonMetricValue[],
  higherIsBetter = true,
): ComparisonMetricRow {
  return { key, label, values, higherIsBetter };
}

export function buildStatisticsRows(profiles: ComparisonPlayerProfile[]): ComparisonMetricRow[] {
  return [
    metric(
      'goals',
      'Goals',
      profiles.map((p) => ({
        playerId: p.player.id,
        display: String(p.player.goals),
        numeric: p.player.goals,
      })),
    ),
    metric(
      'assists',
      'Assists',
      profiles.map((p) => ({
        playerId: p.player.id,
        display: String(p.player.assists),
        numeric: p.player.assists,
      })),
    ),
    metric(
      'matches',
      'Matches',
      profiles.map((p) => ({
        playerId: p.player.id,
        display: String(p.player.matchCount),
        numeric: p.player.matchCount,
      })),
    ),
    metric(
      'overall',
      'Overall Rating',
      profiles.map((p) => ({
        playerId: p.player.id,
        display: String(p.player.overallRating),
        numeric: p.player.overallRating,
      })),
    ),
    metric(
      'potential',
      'Potential',
      profiles.map((p) => ({
        playerId: p.player.id,
        display: String(p.player.potentialRating),
        numeric: p.player.potentialRating,
      })),
    ),
  ];
}

export function buildPhysicalRows(profiles: ComparisonPlayerProfile[]): ComparisonMetricRow[] {
  return [
    metric(
      'height',
      'Height (cm)',
      profiles.map((p) => ({
        playerId: p.player.id,
        display: String(p.player.heightCm),
        numeric: p.player.heightCm,
      })),
    ),
    metric(
      'weight',
      'Weight (kg)',
      profiles.map((p) => ({
        playerId: p.player.id,
        display: String(p.player.weightKg),
        numeric: p.player.weightKg,
      })),
    ),
    metric(
      'sprint',
      'Sprint Speed (km/h)',
      profiles.map((p) => ({
        playerId: p.player.id,
        display: String(p.player.sprintSpeedKmh),
        numeric: p.player.sprintSpeedKmh,
      })),
    ),
    metric(
      'weakFoot',
      'Weak Foot',
      profiles.map((p) => ({
        playerId: p.player.id,
        display: `${p.player.weakFoot}★`,
        numeric: p.player.weakFoot,
      })),
    ),
    metric(
      'skillMoves',
      'Skill Moves',
      profiles.map((p) => ({
        playerId: p.player.id,
        display: `${p.player.skillMoves}★`,
        numeric: p.player.skillMoves,
      })),
    ),
  ];
}

export function buildTechnicalRows(profiles: ComparisonPlayerProfile[]): ComparisonMetricRow[] {
  return [
    metric(
      'passing',
      'Passing',
      profiles.map((p) => ({
        playerId: p.player.id,
        display: String(p.player.ratings.passing),
        numeric: p.player.ratings.passing,
      })),
    ),
    metric(
      'shooting',
      'Shooting',
      profiles.map((p) => ({
        playerId: p.player.id,
        display: String(p.player.ratings.shooting),
        numeric: p.player.ratings.shooting,
      })),
    ),
    metric(
      'defending',
      'Defending',
      profiles.map((p) => ({
        playerId: p.player.id,
        display: String(p.player.ratings.defending),
        numeric: p.player.ratings.defending,
      })),
    ),
    metric(
      'physical',
      'Physical',
      profiles.map((p) => ({
        playerId: p.player.id,
        display: String(p.player.ratings.physical),
        numeric: p.player.ratings.physical,
      })),
    ),
  ];
}

export function buildGpsRows(profiles: ComparisonPlayerProfile[]): ComparisonMetricRow[] {
  return [
    metric(
      'distance',
      'Avg Distance (km)',
      profiles.map((p) => ({
        playerId: p.player.id,
        display: String(p.gps.distanceKm),
        numeric: p.gps.distanceKm,
      })),
    ),
    metric(
      'topSpeed',
      'Top Speed (km/h)',
      profiles.map((p) => ({
        playerId: p.player.id,
        display: String(p.gps.topSpeedKmh),
        numeric: p.gps.topSpeedKmh,
      })),
    ),
    metric(
      'sessions',
      'GPS Sessions',
      profiles.map((p) => ({
        playerId: p.player.id,
        display: String(p.gps.sessionsCount),
        numeric: p.gps.sessionsCount,
      })),
    ),
  ];
}

export function getBestPlayerIdForRow(row: ComparisonMetricRow): string | null {
  const numericValues = row.values.filter((value) => value.numeric !== undefined);
  if (numericValues.length === 0) {
    return null;
  }

  const sorted = [...numericValues].sort((a, b) => {
    const aVal = a.numeric ?? 0;
    const bVal = b.numeric ?? 0;
    return row.higherIsBetter ? bVal - aVal : aVal - bVal;
  });

  return sorted[0]?.playerId ?? null;
}

export function getMetricDelta(
  row: ComparisonMetricRow,
  playerId: string,
): 'best' | 'neutral' | 'worst' {
  const bestId = getBestPlayerIdForRow(row);
  if (!bestId) {
    return 'neutral';
  }

  const numericValues = row.values
    .map((value) => value.numeric)
    .filter((value): value is number => value !== undefined);

  if (numericValues.length < 2) {
    return playerId === bestId ? 'best' : 'neutral';
  }

  const playerValue = row.values.find((value) => value.playerId === playerId)?.numeric;
  if (playerValue === undefined) {
    return 'neutral';
  }

  if (playerId === bestId) {
    return 'best';
  }

  const sorted = [...numericValues].sort((a, b) =>
    row.higherIsBetter ? b - a : a - b,
  );
  const worst = row.higherIsBetter ? sorted[sorted.length - 1] : sorted[0];
  return playerValue === worst ? 'worst' : 'neutral';
}

import {
  type ComparisonMetricKey,
  type ComparisonMetricRow,
  type ComparisonMetricValue,
  type ComparisonPlayerProfile,
} from '@/features/player-comparison/types';
import { starGlyphs } from '@/utils/starRating';

function metric(
  key: ComparisonMetricKey,
  values: ComparisonMetricValue[],
  higherIsBetter = true,
): ComparisonMetricRow {
  return { key, values, higherIsBetter };
}

const UNKNOWN = '—';

/**
 * Builds a metric cell from a nullable number. Unknown values get no `numeric`, so they are
 * excluded from best/worst calculations and render as an em dash.
 */
function cell(
  playerId: string,
  value: number | null | undefined,
  format: (value: number) => string = String,
): ComparisonMetricValue {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { playerId, display: UNKNOWN };
  }
  return { playerId, display: format(value), numeric: value };
}

export function buildStatisticsRows(profiles: ComparisonPlayerProfile[]): ComparisonMetricRow[] {
  return [
    metric('goals', profiles.map((p) => cell(p.player.id, p.player.goals))),
    metric('assists', profiles.map((p) => cell(p.player.id, p.player.assists))),
    metric('matches', profiles.map((p) => cell(p.player.id, p.player.matchCount))),
  ];
}

export function buildPhysicalRows(profiles: ComparisonPlayerProfile[]): ComparisonMetricRow[] {
  return [
    metric('height', profiles.map((p) => cell(p.player.id, p.player.heightCm))),
    metric('weight', profiles.map((p) => cell(p.player.id, p.player.weightKg))),
    metric(
      'sprint',
      profiles.map((p) => cell(p.player.id, p.player.sprintSpeedKmh)),
    ),
    metric(
      'weakFoot',
      profiles.map((p) => cell(p.player.id, p.player.weakFoot, starGlyphs)),
    ),
    metric(
      'skillMoves',
      profiles.map((p) => cell(p.player.id, p.player.skillMoves, starGlyphs)),
    ),
  ];
}

export function buildTechnicalRows(profiles: ComparisonPlayerProfile[]): ComparisonMetricRow[] {
  return [
    metric('passing', profiles.map((p) => cell(p.player.id, p.player.ratings.passing))),
    metric(
      'shooting',
      profiles.map((p) => cell(p.player.id, p.player.ratings.shooting)),
    ),
    metric(
      'defending',
      profiles.map((p) => cell(p.player.id, p.player.ratings.defending)),
    ),
    metric(
      'physical',
      profiles.map((p) => cell(p.player.id, p.player.ratings.physical)),
    ),
  ];
}

export function buildGpsRows(profiles: ComparisonPlayerProfile[]): ComparisonMetricRow[] {
  return [
    metric(
      'distance',
      profiles.map((p) => cell(p.player.id, p.gps?.distanceKm)),
    ),
    metric(
      'topSpeed',
      profiles.map((p) => cell(p.player.id, p.gps?.topSpeedKmh)),
    ),
    metric(
      'sessions',
      profiles.map((p) => cell(p.player.id, p.gps?.sessionsCount)),
    ),
  ];
}

export function selectStatisticRows(
  rows: ComparisonMetricRow[],
  keys: string[],
): ComparisonMetricRow[] {
  const allowed = new Set(keys);
  return rows.filter((row) => allowed.has(row.key));
}
export function rowHasData(row: ComparisonMetricRow): boolean {
  return row.values.some((value) => value.numeric !== undefined);
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

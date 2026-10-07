import { alignToMainAxis } from '@/features/gps/services/gpsSessionCalculator';
import type { GpsIntelligence, GpsPoint, GpsSprint, SpeedBand } from '@/features/gps/types';

export type { GpsIntelligence, GpsSprint, SpeedBand } from '@/features/gps/types';

/** A session shorter than this, or with fewer points, is too thin to describe movement. */
export const GPS_MIN_DURATION_SEC = 600;
export const GPS_MIN_POINTS = 120;
/** Points reported with a worse median accuracy than this make spatial measures unreliable. */
export const GPS_MAX_MEDIAN_ACCURACY_M = 20;

const SPRINT_SPEED_MS = 7;
const SPRINT_MIN_SEC = 1;

function bandFor(speedMs: number): SpeedBand {
  if (speedMs >= SPRINT_SPEED_MS) return 'sprint';
  if (speedMs >= 4) return 'run';
  if (speedMs >= 2) return 'jog';
  return 'walk';
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[index];
}

export function detectSprints(points: readonly GpsPoint[]): GpsSprint[] {
  const sprints: GpsSprint[] = [];
  let start: GpsPoint | null = null;
  let peak = 0;
  const close = (end: GpsPoint) => {
    if (start && (end.elapsedMs - start.elapsedMs) / 1000 >= SPRINT_MIN_SEC) {
      sprints.push({
        startSec: Math.round(start.elapsedMs / 1000),
        endSec: Math.round(end.elapsedMs / 1000),
        peakKmh: Math.round(peak * 36) / 10,
      });
    }
    start = null;
    peak = 0;
  };
  for (const point of points) {
    if (point.speed >= SPRINT_SPEED_MS) {
      if (!start) start = point;
      peak = Math.max(peak, point.speed);
    } else if (start) {
      close(point);
    }
  }
  const last = points[points.length - 1];
  if (start && last) close(last);
  return sprints;
}

/**
 * Orientation-independent movement summary. GPS alone does not know which way the pitch
 * runs, so spread is measured along the player's own main movement axis.
 */
export function buildGpsIntelligence(points: readonly GpsPoint[]): GpsIntelligence {
  const ordered = [...points].sort((a, b) => a.elapsedMs - b.elapsedMs);
  const durationSec = ordered.length > 1 ? Math.round((ordered[ordered.length - 1].elapsedMs - ordered[0].elapsedMs) / 1000) : 0;
  const accuracies = ordered.map((point) => point.accuracy).filter((value) => value > 0).sort((a, b) => a - b);
  const medianAccuracyM = accuracies.length > 0 ? Math.round(percentile(accuracies, 0.5)) : null;
  const sample = { points: ordered.length, durationSec, medianAccuracyM };
  const sprints = detectSprints(ordered);

  if (ordered.length < GPS_MIN_POINTS || durationSec < GPS_MIN_DURATION_SEC) {
    return { status: 'insufficient', sample, widthM: null, depthM: null, centralSharePct: null, bands: null, sprints };
  }

  const seconds: Record<SpeedBand, number> = { walk: 0, jog: 0, run: 0, sprint: 0 };
  for (let index = 1; index < ordered.length; index += 1) {
    const dt = Math.max(0, (ordered[index].elapsedMs - ordered[index - 1].elapsedMs) / 1000);
    seconds[bandFor(ordered[index - 1].speed)] += dt;
  }
  const total = Object.values(seconds).reduce((sum, value) => sum + value, 0) || 1;
  const bands = {
    walk: Math.round((seconds.walk / total) * 100),
    jog: Math.round((seconds.jog / total) * 100),
    run: Math.round((seconds.run / total) * 100),
    sprint: Math.round((seconds.sprint / total) * 100),
  };

  if (medianAccuracyM !== null && medianAccuracyM > GPS_MAX_MEDIAN_ACCURACY_M) {
    return { status: 'low_accuracy', sample, widthM: null, depthM: null, centralSharePct: null, bands, sprints };
  }

  const aligned = alignToMainAxis(ordered);
  const along = aligned.map((point) => point.along);
  const sortedAlong = [...along].sort((a, b) => a - b);
  const sortedAcross = aligned.map((point) => point.across).sort((a, b) => a - b);
  const lo = percentile(sortedAlong, 0.05);
  const hi = percentile(sortedAlong, 0.95);
  const third = (hi - lo) / 3;

  let central = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    const dt = Math.max(0, (ordered[index].elapsedMs - ordered[index - 1].elapsedMs) / 1000);
    const position = along[index - 1];
    if (position >= lo + third && position <= hi - third) central += dt;
  }

  return {
    status: 'ok',
    sample,
    widthM: Math.round(percentile(sortedAcross, 0.95) - percentile(sortedAcross, 0.05)),
    depthM: Math.round(hi - lo),
    centralSharePct: Math.round((central / total) * 100),
    bands,
    sprints,
  };
}

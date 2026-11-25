/**
 * Resource budget derived from the measured CPU8 run. Scaling to any other duration is an
 * extrapolation. This module does not dispatch work and does not change the 1,680-second client.
 *
 * The measured run is the 2,035-second IMG_4809 10 fps proxy: wall 6,628.491 s, detect 3,878.86 s,
 * resolve 610.872 s. Eliminating the detector would still leave the remainder of that wall.
 */
import { TRACKING_WORKER_CLIENT_MS } from './trackingDeadlines';
import { planSegments } from './trackingProgress';

export const CPU8_MEASURED = {
  durationSec: 2035,
  wallSec: 6628.491,
  discoverySec: 1035.395,
  extractionSec: 4897.764,
  detectSec: 3878.86,
  resolveSec: 610.872,
} as const;

export const UNMEASURED_COST_LINES = [
  'upload', 'queue_wait', 'retry', 'highlight_render', 'storage', 'network', 'worker_startup',
] as const;

export type Timed = { seconds: number; kind: 'measured' | 'extrapolated' };

function scale(seconds: number, durationSec: number): Timed {
  if (!(durationSec > 0) || !Number.isFinite(durationSec)) throw new Error('duration must be a positive finite number');
  if (durationSec === CPU8_MEASURED.durationSec) return { seconds, kind: 'measured' };
  return { seconds: seconds * (durationSec / CPU8_MEASURED.durationSec), kind: 'extrapolated' };
}

export function resolveBudget(durationSec: number): Timed {
  return scale(CPU8_MEASURED.resolveSec, durationSec);
}

export function nonDetectorBudget(durationSec: number): Timed {
  return scale(CPU8_MEASURED.wallSec - CPU8_MEASURED.detectSec, durationSec);
}

export type ExecutionRequirement = {
  resolve: Timed;
  nonDetector: Timed;
  clientBudgetSec: number;
  model: 'fits_current_client' | 'exceeds_current_client';
  sameShapeAsHistoricalBenchmark: boolean;
};

/** Historical extraction was seven sequential chunks, the first six 300 s. Production is not that plan. */
export function sameShapeAsHistoricalBenchmark(durationSec: number): boolean {
  const plan = planSegments(durationSec);
  if (plan.length !== 7 || plan[0]?.endSec !== 300) return false;
  return plan.every((segment, index) => index === plan.length - 1 || segment.endSec - segment.startSec === 300);
}

export function executionRequirement(durationSec: number): ExecutionRequirement {
  const resolve = resolveBudget(durationSec);
  const clientBudgetSec = TRACKING_WORKER_CLIENT_MS / 1000;
  return {
    resolve,
    nonDetector: nonDetectorBudget(durationSec),
    clientBudgetSec,
    model: resolve.seconds <= clientBudgetSec ? 'fits_current_client' : 'exceeds_current_client',
    sameShapeAsHistoricalBenchmark: sameShapeAsHistoricalBenchmark(durationSec),
  };
}

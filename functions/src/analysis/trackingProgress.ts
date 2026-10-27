/**
 * Video Intelligence 4.0 - progressive tracking analysis: pure planning and decision rules.
 *
 * The orchestrator (trackingOrchestrator.ts) persists only FACTS here: the segment plan, which
 * segments finished, how long each took on the worker, and which reports were published. The app
 * derives the user-facing stages and any time estimate from those facts; nothing stores an
 * invented percentage.
 *
 * Kept dependency-free so the unit suite imports it directly.
 */

export const PROGRESS_SCHEMA = 'pitchproof.tracking.progress.v1';

/** The worker accepts segment indexes 0..60 and segments of at most 900 s. */
export const MAX_SEGMENTS = 61;
export const FIRST_SEGMENT_SEC = 120;
export const SEGMENT_SEC = 300;
export const MAX_SEGMENT_SEC = 900;

export type SegmentPlan = { index: number; startSec: number; endSec: number };
export type SegmentStatus = 'queued' | 'running' | 'done' | 'failed';
export type SegmentState = {
  status: SegmentStatus;
  attempts: number;
  /** Worker-measured processing time for this segment (stage 1), seconds. */
  processingSec?: number;
  startedAt?: string;
  doneAt?: string;
};
export type ReportScope = 'preliminary' | 'full';
export type PublishedReport = { scope: ReportScope; parts: number; analysedEndSec: number; moments: number;
  reviewQuestions: number; at: string };
export type ProgressBlock = 'worker_unavailable' | 'consent_required' | 'source_missing';

export type TrackingProgress = {
  schema: typeof PROGRESS_SCHEMA;
  generation: number;
  durationSec: number;
  plan: SegmentPlan[];
  segments: Record<string, SegmentState>;
  startedAt: string;
  updatedAt: string;
  /** The resolve currently queued or running, if any. */
  resolving: ReportScope | null;
  preliminary: PublishedReport | null;
  full: PublishedReport | null;
  /** Terminal problem: the analysis stopped and the user may need to act. */
  outcome: null | 'interrupted' | 'cancelled';
  blocked: ProgressBlock | null;
};

/**
 * Splits the recording into extraction segments. The first segment is short so first results
 * arrive early; the rest are SEGMENT_SEC long (grown if needed to stay within MAX_SEGMENTS).
 * A remainder shorter than 30 s is folded into the previous segment.
 */
export function planSegments(durationSec: number, firstSec = FIRST_SEGMENT_SEC, segSec = SEGMENT_SEC): SegmentPlan[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  let size = segSec;
  while (1 + Math.ceil(Math.max(0, durationSec - firstSec) / size) > MAX_SEGMENTS && size < MAX_SEGMENT_SEC) size += 60;
  const bounds: number[] = [0];
  let t = Math.min(firstSec, durationSec);
  bounds.push(t);
  while (t < durationSec) {
    t = Math.min(durationSec, t + size);
    bounds.push(t);
  }
  if (bounds.length > 2 && bounds[bounds.length - 1] - bounds[bounds.length - 2] < 30) bounds.splice(bounds.length - 2, 1);
  const plan: SegmentPlan[] = [];
  for (let i = 0; i + 1 < bounds.length; i += 1) {
    plan.push({ index: i, startSec: round2(bounds[i]), endSec: round2(bounds[i + 1]) });
  }
  return plan.filter((s) => s.endSec - s.startSec <= MAX_SEGMENT_SEC).slice(0, MAX_SEGMENTS);
}

export function newProgress(generation: number, durationSec: number, now: string): TrackingProgress {
  const plan = planSegments(durationSec);
  const segments: Record<string, SegmentState> = {};
  for (const s of plan) segments[String(s.index)] = { status: 'queued', attempts: 0 };
  return { schema: PROGRESS_SCHEMA, generation, durationSec, plan, segments, startedAt: now, updatedAt: now,
    resolving: null, preliminary: null, full: null, outcome: null, blocked: null };
}

export function doneCount(p: Pick<TrackingProgress, 'segments'>): number {
  return Object.values(p.segments).filter((s) => s.status === 'done').length;
}

/**
 * When to publish an early ("Quick Review") report while extraction continues: after each of the
 * first three finished segments until one actually contains moments (a recording often starts
 * with a warm-up), then every sixth segment. The full report is always produced at the end.
 */
export function shouldResolvePreliminary(done: number, total: number, preliminaryMoments: number | null): boolean {
  if (done <= 0 || done >= total) return false;
  if ((preliminaryMoments ?? 0) === 0 && done <= 3) return true;
  return done % 6 === 0;
}

/**
 * Version guard: a report may only replace the current one when it covers at least as much of the
 * recording. A preliminary report therefore never overwrites a fuller one, whatever order the
 * resolves finish in.
 */
export function shouldReplaceReport(current: { parts: number; scope?: ReportScope } | null,
  incoming: { parts: number; scope: ReportScope }): boolean {
  if (!current) return true;
  if (incoming.parts < current.parts) return false;
  if (current.scope === 'full' && incoming.scope === 'preliminary') return false;
  return true;
}

export type Throughput = { videoSecDone: number; workerSecDone: number; wallSecElapsed: number;
  /** wall-clock seconds per second of video, measured over the finished segments */
  wallPerVideoSec: number };

/** Measured throughput from finished segments only; null until at least one segment finished. */
export function measuredThroughput(p: Pick<TrackingProgress, 'plan' | 'segments' | 'startedAt'>, nowMs: number): Throughput | null {
  let videoSecDone = 0;
  let workerSecDone = 0;
  let lastDone = 0;
  const started = Date.parse(p.startedAt);
  for (const s of p.plan) {
    const st = p.segments[String(s.index)];
    // Only segments processed in this run count (a resumed run measures its own speed).
    if (st?.status !== 'done' || !((Date.parse(st.doneAt ?? '') || 0) >= started)) continue;
    videoSecDone += s.endSec - s.startSec;
    workerSecDone += st.processingSec ?? 0;
    lastDone = Math.max(lastDone, Date.parse(st.doneAt ?? '') || 0);
  }
  if (videoSecDone <= 0 || !Number.isFinite(started) || lastDone <= started) return null;
  const wallSecElapsed = (Math.min(nowMs, lastDone) - started) / 1000;
  return { videoSecDone, workerSecDone, wallSecElapsed, wallPerVideoSec: wallSecElapsed / videoSecDone };
}

/**
 * Remaining wall-clock time for extraction, extrapolated ONLY from this job's measured rate.
 * Returns null when nothing was measured yet (the app then shows no estimate at all).
 */
export function remainingExtractionSec(p: Pick<TrackingProgress, 'plan' | 'segments' | 'startedAt'>, nowMs: number): number | null {
  const tp = measuredThroughput(p, nowMs);
  if (!tp) return null;
  const remainingVideo = p.plan.filter((s) => p.segments[String(s.index)]?.status !== 'done')
    .reduce((a, s) => a + (s.endSec - s.startSec), 0);
  return Math.round(remainingVideo * tp.wallPerVideoSec);
}

/** Deterministic, de-duplicated notification ids: one real event never notifies twice. */
export function notificationId(kind: 'started' | 'first_moments' | 'review_needed' | 'ready' | 'interrupted' | 'action_required',
  jobId: string, generation: number): string {
  return `tracking-${kind}-${jobId}-g${generation}`;
}

/** Review is "needed" only when the user's answers can materially change the report. */
export function reviewNeeded(report: { reviewQuestions: unknown[]; coverage: { confirmedVisibleSec: number; analysedSec: number } }): boolean {
  if (report.reviewQuestions.length === 0) return false;
  return report.coverage.analysedSec > 0 && report.coverage.confirmedVisibleSec / report.coverage.analysedSec < 0.5;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export type ProgressMetrics = {
  /** wall time from start to the first published report (preliminary or full) */
  timeToFirstReportSec: number | null;
  timeToFullReportSec: number | null;
  /** worker seconds per second of video, over finished segments */
  workerSecPerVideoSec: number | null;
  segmentRetries: number;
  segmentFailures: number;
  firstReportHadMoments: boolean | null;
};

/**
 * Quality/latency metrics of one analysis, computed from the persisted facts only (for
 * dashboards; nothing user-identifying beyond the job itself).
 */
export function progressMetrics(p: TrackingProgress): ProgressMetrics {
  const started = Date.parse(p.startedAt);
  const since = (at: string | undefined) => {
    const t = Date.parse(at ?? '');
    return Number.isFinite(t) && Number.isFinite(started) && t >= started ? Math.round((t - started) / 1000) : null;
  };
  const first = [p.preliminary, p.full].filter((r): r is PublishedReport => r !== null)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0] ?? null;
  let video = 0;
  let worker = 0;
  let retries = 0;
  let failures = 0;
  for (const s of p.plan) {
    const st = p.segments[String(s.index)];
    if (!st) continue;
    retries += Math.max(0, st.attempts - 1);
    if (st.status === 'failed') failures += 1;
    if (st.status === 'done' && typeof st.processingSec === 'number') {
      video += s.endSec - s.startSec;
      worker += st.processingSec;
    }
  }
  return {
    timeToFirstReportSec: first ? since(first.at) : null,
    timeToFullReportSec: p.full ? since(p.full.at) : null,
    workerSecPerVideoSec: video > 0 ? Math.round((worker / video) * 100) / 100 : null,
    segmentRetries: retries,
    segmentFailures: failures,
    firstReportHadMoments: first ? first.moments > 0 : null,
  };
}

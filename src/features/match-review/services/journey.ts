/**
 * The analysis journey as the player sees it: seven plain-language stages derived ONLY from
 * persisted processing facts (tracking/progress + tracking/current). No percentage is invented:
 * a stage is done, active, pending or blocked, extraction shows "n of m parts", and a time
 * estimate appears only once this job's own speed has been measured.
 */
import type { TrackingDoc, TrackingProgressDoc } from '@/features/match-analysis/services/trackingPresentation';

export const JOURNEY_STAGES = [
  'received', // the video is stored and validated
  'preparing', // segment extraction: people, appearance, camera motion (known work units)
  'finding', // identity resolve over the parts extracted so far
  'moments', // a report with watchable moments exists
  'actions', // the whole recording has been extracted (all actions can be reviewed)
  'report', // the full report is being built and validated
  'ready', // full report published
] as const;
export type JourneyStageId = (typeof JOURNEY_STAGES)[number];
export type StageStatus = 'done' | 'active' | 'pending' | 'blocked';
export type JourneyStage = { id: JourneyStageId; status: StageStatus };

export type JourneyProblem = {
  kind: 'consent_required' | 'source_missing' | 'worker_unavailable' | 'interrupted' | 'cancelled';
  /** What the user can do about it. */
  action: 'give_consent' | 'upload_again' | 'wait' | 'resume' | 'none';
  /** Whether simply retrying is expected to help. */
  retryHelps: boolean;
};

export type Journey = {
  stages: JourneyStage[];
  /** Extraction work units: parts of the recording finished / planned. */
  parts: { done: number; total: number };
  /** Seconds left for extraction, from this job's measured speed; null = not measured yet. */
  remainingSec: number | null;
  /** Which results the user can open right now. */
  unlocked: { preview: boolean; timeline: boolean; moments: boolean; review: boolean; coaching: boolean };
  /** True while results are partial (a preliminary report covers only part of the match). */
  partial: boolean;
  analysedUntilSec: number | null;
  problem: JourneyProblem | null;
  complete: boolean;
};

const PROBLEMS: Record<JourneyProblem['kind'], Omit<JourneyProblem, 'kind'>> = {
  consent_required: { action: 'give_consent', retryHelps: false },
  source_missing: { action: 'upload_again', retryHelps: false },
  worker_unavailable: { action: 'wait', retryHelps: true },
  interrupted: { action: 'resume', retryHelps: true },
  cancelled: { action: 'none', retryHelps: false },
};

function measuredRemaining(p: TrackingProgressDoc, nowMs: number): number | null {
  const started = Date.parse(p.startedAt);
  if (!Number.isFinite(started)) return null;
  let videoDone = 0;
  let lastDone = 0;
  let remaining = 0;
  for (const s of p.plan) {
    const st = p.segments[String(s.index)];
    const doneAt = Date.parse(st?.doneAt ?? '') || 0;
    if (st?.status === 'done' && doneAt >= started) {
      videoDone += s.endSec - s.startSec;
      lastDone = Math.max(lastDone, doneAt);
    } else if (st?.status !== 'done') {
      remaining += s.endSec - s.startSec;
    }
  }
  if (videoDone <= 0 || lastDone <= started) return null;
  const rate = (Math.min(nowMs, lastDone) - started) / 1000 / videoDone;
  return Math.max(0, Math.round(remaining * rate));
}

export function deriveJourney(progress: TrackingProgressDoc | null, tracking: TrackingDoc | null, nowMs = Date.now()): Journey | null {
  if (!progress && !tracking?.report) return null;
  const report = tracking?.report ?? null;
  const total = progress?.plan.length ?? 0;
  const done = progress ? Object.values(progress.segments).filter((s) => s.status === 'done').length : 0;
  const extractionDone = progress ? total > 0 && done >= total : true;
  const full = Boolean(progress?.full) || (!progress && Boolean(report)) || tracking?.scope === 'full';
  const hasMoments = (report?.moments?.length ?? 0) > 0;
  const problemKind: JourneyProblem['kind'] | null = progress?.blocked ?? progress?.outcome ?? null;
  const problem = problemKind ? { kind: problemKind, ...PROBLEMS[problemKind] } : null;
  const anyRunning = progress ? Object.values(progress.segments).some((s) => s.status === 'running') : false;

  const status = (isDone: boolean, isActive: boolean): StageStatus =>
    isDone ? 'done' : problem && isActive ? 'blocked' : isActive ? 'active' : 'pending';
  const stages: JourneyStage[] = [
    { id: 'received', status: 'done' },
    { id: 'preparing', status: status(extractionDone, !extractionDone && (anyRunning || done > 0 || Boolean(progress))) },
    { id: 'finding', status: status(Boolean(report), !report && (progress?.resolving != null || done > 0)) },
    { id: 'moments', status: status(Boolean(report) && (hasMoments || full), Boolean(report) && !hasMoments && !full) },
    { id: 'actions', status: status(extractionDone && Boolean(report), Boolean(report) && !extractionDone) },
    { id: 'report', status: status(full, extractionDone && !full) },
    { id: 'ready', status: full ? 'done' : 'pending' },
  ];
  return {
    stages,
    parts: { done, total },
    remainingSec: progress && !extractionDone && !problem ? measuredRemaining(progress, nowMs) : null,
    unlocked: { preview: true, timeline: Boolean(report), moments: hasMoments, review: (report?.reviewQuestions.length ?? 0) > 0,
      coaching: full },
    partial: Boolean(report) && !full,
    analysedUntilSec: report?.analysedRange?.endSec ?? null,
    problem,
    complete: full,
  };
}

/** Coarse, honest wording for a measured estimate: never more precise than the measurement. */
export function roundEstimate(sec: number): { unit: 'minutes' | 'hours'; value: number } {
  if (sec < 90 * 60) return { unit: 'minutes', value: Math.max(1, Math.ceil(sec / 60 / 5) * 5) };
  return { unit: 'hours', value: Math.round((sec / 3600) * 2) / 2 };
}

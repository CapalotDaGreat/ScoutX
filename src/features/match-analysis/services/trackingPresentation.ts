/** Pure types and presentation helpers for player tracking v3 (no Firebase imports). */

/** Mirrors functions/src/analysis/trackingV3.ts (server-validated, target-only). */
export type TrackingIdentityState =
  | 'CONFIRMED_VISIBLE' | 'LIKELY_VISIBLE' | 'AMBIGUOUS' | 'OFF_CAMERA' | 'CONFIRMED_OFF_PITCH' | 'NON_MATCH_PERIOD' | 'UNKNOWN';
export type TrackingProvenance = 'calibrated' | 'estimate_experimental' | 'unavailable' | 'model_estimate_unvalidated';
export type TrackingAnswer = 'yes' | 'not_me' | 'unsure' | 'skip';

export type TrackingCoverage = {
  recordingSec: number; nonMatchSec: number; offPitchSec: number; matchSec: number; unobservedSec: number;
  analysedSec: number; confirmedVisibleSec: number; likelyVisibleSec: number; ambiguousSec: number; notIdentifiedSec: number;
};
export type TrackingMetric = { value: number | null; unit: string; provenance: TrackingProvenance; method: string; note?: string };
export type TrackingQuestion = {
  id: string; t: number; box: [number, number, number, number]; affectedSec: number; currentlyTarget: boolean;
  score: number; imagePath?: string | null;
};
export type TrackingReport = {
  schema: 'pitchproof.tracking.v3';
  engineVersion: string;
  target: { number: string | null; kit: string; kit2: string; position: string };
  coverage: TrackingCoverage;
  periods: Array<{ start: number; end: number; kind: 'play' | 'non_play' | 'unobserved'; label: string; source: 'detected' | 'user' }>;
  statesSec: Partial<Record<TrackingIdentityState, number>>;
  stateStrip: Array<[number, number, TrackingIdentityState]>;
  physical: {
    status: 'calibrated' | 'experimental' | 'unavailable'; productionVisible: boolean; reason: string | null;
    values: Record<string, TrackingMetric>;
    sprints: Array<{ start: number; end: number; durationSec: number; peakKmh: number; distanceM: number }>;
    highSpeedRuns: Array<{ start: number; end: number; durationSec: number; peakKmh: number; distanceM: number }>;
    thresholds: { sprint_kmh: number; hsr_kmh: number };
  };
  ball: { contacts: number; carries: number; passAttempts: number; completedPasses: number; incompletePasses: number;
    unknownOutcomePasses: number; provenance: TrackingProvenance };
  events: Array<{ type: 'contact' | 'carry' | 'pass_attempt' | 'duel_candidate' | 'tackle_candidate'; candidate?: true; start: number; end: number; identityState: TrackingIdentityState;
    outcome?: 'completed' | 'incomplete' | 'unknown' }>;
  reviewQuestions: TrackingQuestion[];
  identity: { numberSightings: number; confirmedByUser: number };
  heatmap: { status: 'observed_only' | 'unavailable'; reason?: string };
  referenceImagePath?: string | null;
  /** 4.0: watchable clip windows around the target's own measured actions / identified spells. */
  moments?: TrackingMoment[];
  /** 4.1: distances to nearest opponent/team-mate on confirmed frames (body heights, image plane). */
  offball?: {
    status: 'measured' | 'insufficient'; confirmedSec: number; minConfirmedSec: number; measuredSec?: number;
    nearestOpponentBodyHeights?: { median: number; p25: number; p75: number };
    nearestTeammateBodyHeights?: { median: number } | null;
    freeShare?: number; tightShare?: number;
    freeEpisodes?: Array<{ start: number; end: number }>; tightEpisodes?: Array<{ start: number; end: number }>;
  } | null;
  analysedRange?: { startSec: number; endSec: number; parts: number };
  videoSize?: { width: number; height: number } | null;
};
export type TrackingMomentKind = 'contact' | 'carry' | 'pass_attempt' | 'duel_candidate' | 'tackle_candidate' | 'spell' | 'sighting';
export type TrackingMoment = {
  id: string; kind: TrackingMomentKind; kinds: TrackingMomentKind[]; start: number; end: number;
  clipStart: number; clipEnd: number; identityState: 'CONFIRMED_VISIBLE' | 'LIKELY_VISIBLE'; candidate: boolean;
  outcome?: 'completed' | 'incomplete' | 'unknown';
  /** [t, x, y, w, h], box normalised to the frame */
  indicator: Array<[number, number, number, number, number]>;
  imagePath?: string | null;
  /** 4.1 discovery: the shirt number was read in this moment */
  evidence?: 'number_read';
  readFrames?: number;
};
/** 4.1: number sightings found by the early discovery pass (owner-only, server-written). */
export type TrackingDiscoveryDoc = { moments: TrackingMoment[]; generation: number; updatedAt: string };
export type TrackingDoc = { report: TrackingReport | null; version: number; stale: boolean; pendingReason?: string | null;
  /** 'preliminary' while the rest of the match is still being analysed. */
  scope?: 'preliminary' | 'full'; parts?: number };

/** Mirrors functions/src/analysis/trackingProgress.ts: persisted facts only, never a percentage. */
export type TrackingProgressDoc = {
  generation: number;
  durationSec: number;
  plan: Array<{ index: number; startSec: number; endSec: number }>;
  segments: Record<string, { status: 'queued' | 'running' | 'done' | 'failed'; attempts: number; processingSec?: number;
    startedAt?: string; doneAt?: string }>;
  startedAt: string;
  updatedAt: string;
  resolving: 'preliminary' | 'full' | null;
  preliminary: { scope: 'preliminary' | 'full'; parts: number; analysedEndSec: number; moments: number; reviewQuestions: number; at: string } | null;
  full: { scope: 'preliminary' | 'full'; parts: number; analysedEndSec: number; moments: number; reviewQuestions: number; at: string } | null;
  outcome: null | 'interrupted' | 'cancelled';
  blocked: null | 'worker_unavailable' | 'consent_required' | 'source_missing';
  discovery?: {
    chunks: Array<{ index: number; startSec: number; endSec: number }>;
    state: Record<string, { status: 'queued' | 'done' | 'failed'; attempts: number; moments?: number; doneAt?: string }>;
    firstMomentAt: string | null;
    sightingTimes: number[];
    extractionQueued: boolean;
  } | null;
};

/**
 * Report moments plus discovery sightings not already covered by a report moment (4.1). A
 * sighting overlapping a confirmed report moment is dropped (the report moment shows it).
 */
export function mergeDiscoveryMoments(reportMoments: TrackingMoment[] | undefined, discovery: TrackingMoment[] | undefined): TrackingMoment[] {
  const base = reportMoments ?? [];
  const extra = (discovery ?? []).filter((d) => !base.some((m) => m.identityState === 'CONFIRMED_VISIBLE'
    && d.start >= m.clipStart - 1 && d.start <= m.clipEnd + 1));
  return [...base, ...extra].sort((a, b) => a.clipStart - b.clipStart);
}

export function withDiscovery(report: TrackingReport | null, discovery: TrackingMoment[] | undefined): TrackingReport | null {
  if (!report || !discovery?.length) return report;
  return { ...report, moments: mergeDiscoveryMoments(report.moments, discovery) };
}

export const STATE_COLORS: Record<TrackingIdentityState, string> = {
  CONFIRMED_VISIBLE: '#1f9d55', LIKELY_VISIBLE: '#8bc34a', AMBIGUOUS: '#f0a500', OFF_CAMERA: '#c9d3e6',
  CONFIRMED_OFF_PITCH: '#9aa7c0', NON_MATCH_PERIOD: '#b9b9b9', UNKNOWN: '#d5dbd6',
};

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function minutes(sec: number): string {
  return (sec / 60).toFixed(1);
}

/** Share of analysed match time - never of the recording or of playing time. */
export function shareOfAnalysed(sec: number, coverage: TrackingCoverage): number {
  return coverage.analysedSec > 0 ? Math.round((100 * sec) / coverage.analysedSec) : 0;
}

/** Coverage bar segments in a fixed order; widths are fractions of the recording. */
export function coverageSegments(c: TrackingCoverage): Array<{ key: string; sec: number; fraction: number; color: string }> {
  const parts: Array<[string, number, string]> = [
    ['confirmed', c.confirmedVisibleSec, STATE_COLORS.CONFIRMED_VISIBLE],
    ['likely', c.likelyVisibleSec, STATE_COLORS.LIKELY_VISIBLE],
    ['ambiguous', c.ambiguousSec, STATE_COLORS.AMBIGUOUS],
    ['notIdentified', c.notIdentifiedSec, STATE_COLORS.UNKNOWN],
    ['unobserved', c.unobservedSec, '#e8ece7'],
    ['nonMatch', c.nonMatchSec + c.offPitchSec, STATE_COLORS.NON_MATCH_PERIOD],
  ];
  const total = Math.max(c.recordingSec, 1e-9);
  return parts.filter(([, s]) => s > 0).map(([key, sec, color]) => ({ key, sec, fraction: sec / total, color }));
}

/** Physical values are shown as verified only when calibrated; otherwise they stay fenced off. */
export function physicalPresentation(report: TrackingReport): 'verified' | 'experimental' | 'unavailable' {
  if (report.physical.status === 'calibrated' && report.physical.productionVisible) return 'verified';
  return report.physical.status === 'unavailable' ? 'unavailable' : 'experimental';
}

/** Next unanswered question, most valuable first (server order), skipping locally answered ones. */
export function nextQuestion(report: TrackingReport | null, answered: ReadonlySet<string>): TrackingQuestion | null {
  return report?.reviewQuestions.find((q) => !answered.has(q.id)) ?? null;
}

/** Client-side pre-check so obviously wrong input never hits the server. */
export function looksLikeVideoLink(text: string): boolean {
  try {
    const u = new URL(text.trim());
    return u.protocol === 'https:' && u.hostname.includes('.');
  } catch {
    return false;
  }
}

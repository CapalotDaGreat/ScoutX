// Report-level evaluation of published match-analysis reports against human labels.
// Complements workers/football-cv/eval/evaluate.py (worker output vs annotations): this scores what the PLAYER is
// shown - claims, events, narrative citations and whether the report is usable - and keeps the development split
// strictly separate from the held-out split. It only reads files; it never calls a worker, provider or network.
import { createHash } from 'node:crypto';

export type Interval = [number, number];
export type Split = 'development' | 'heldout';

export type ClipLabels = {
  clipId: string;
  split: Split;
  sourceSha256: string;
  synthetic?: boolean;
  reviewers: string[];
  blinded?: boolean;
  /** Reviewed: the target is on screen and identifiable. */
  visibleIntervals: Interval[];
  /** Reviewed: the target is NOT on screen (off camera, other player, substitution). Everything else is unlabelled. */
  absentIntervals: Interval[];
  events: Array<{ type: string; t: number }>;
  /** False when nobody labelled events: event precision, recall and timestamp error are then not scored (never read as 0). */
  eventsLabelled?: boolean;
  tags?: string[];
};

export type ReportMoment = { id: string; kind: string; start: number; end: number; identityState: string };
export type ReportEvent = { type: string; start: number; end: number; identityState?: string };
export type ReportAnswer = { momentId: string; frames: Array<{ id: string; t: number }>;
  clip?: { start: number; end: number };
  answer: { observation?: string; evidenceFrames?: string[] } };
export type PredictedReport = {
  scope?: 'preliminary' | 'full';
  moments: ReportMoment[];
  events: ReportEvent[];
  answers?: ReportAnswer[];
  /** Seconds from upload to the first published report that shows at least one claimed moment (measured, if known). */
  firstUsefulSec?: number | null;
  fullSec?: number | null;
};

export const CLAIM_STATES = new Set(['CONFIRMED_VISIBLE', 'LIKELY_VISIBLE']);
const MIN_P95_SAMPLES = 20;
const MIN_HELDOUT_CLIPS = 30; // thresholds.json minimumVideos (proposed)

const inside = (t: number, list: Interval[]) => list.some(([a, b]) => t >= a && t < b);
const dur = (i: Interval) => Math.max(0, i[1] - i[0]);
export function overlapSec(a: Interval, list: Interval[]): number {
  const parts = list.map(([s, e]): Interval => [Math.max(a[0], s), Math.min(a[1], e)])
    .filter(([s, e]) => e > s).sort((x, y) => x[0] - y[0]);
  let end = -Infinity; let total = 0;
  for (const [s, e] of parts) { total += Math.max(0, e - Math.max(s, end)); end = Math.max(end, e); }
  return total;
}
const share = (a: Interval, list: Interval[]) => (dur(a) > 0 ? overlapSec(a, list) / dur(a) : (inside(a[0], list) ? 1 : 0));

/** Maximum one-to-one matches, then minimum total timestamp error, independent of input order. */
function matchEvents(predicted: ReportEvent[], truth: ClipLabels['events']) {
  let matched = 0; let error = 0;
  type Cell = { matched: number; error: number };
  const best = (a: Cell, b: Cell) => a.matched > b.matched || (a.matched === b.matched && a.error <= b.error) ? a : b;
  for (const type of new Set(truth.map((e) => e.type))) {
    const ps = predicted.filter((e) => e.type === type).map((e) => (e.start + e.end) / 2).sort((a, b) => a - b);
    const ts = truth.filter((e) => e.type === type).map((e) => e.t).sort((a, b) => a - b);
    let prev: Cell[] = ts.map(() => ({ matched: 0, error: 0 }));
    prev.unshift({ matched: 0, error: 0 });
    for (const p of ps) {
      const next: Cell[] = [{ matched: 0, error: 0 }];
      for (let j = 1; j <= ts.length; j += 1) {
        let cell = best(prev[j], next[j - 1]);
        const delta = Math.abs(p - ts[j - 1]);
        if (delta <= 2) cell = best(cell, { matched: prev[j - 1].matched + 1, error: prev[j - 1].error + delta });
        next.push(cell);
      }
      prev = next;
    }
    matched += prev[ts.length].matched; error += prev[ts.length].error;
  }
  return { matched, error };
}

export function wilson(k: number, n: number, z = 1.96): [number, number] | null {
  if (n <= 0) return null;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}
const ratio = (k: number, n: number) => (n > 0 ? k / n : null);

export type ClipScore = {
  clipId: string; split: Split; labelled: boolean; synthetic: boolean;
  claims: number; claimsSupported: number; claimsWrongPlayer: number; claimsUnverified: number;
  eventsPredicted: number; eventsTruth: number; eventsMatched: number; timestampErrorSumSec: number;
  answers: number; answersSupported: number;
  hasClaim: boolean; fullReport: boolean; usable: boolean; firstUsefulSec: number | null; fullSec: number | null;
};

/** Claim = a moment or event the report presents as the target. Wrong player = it lies mostly where the target is labelled absent. */
export function scoreClip(labels: ClipLabels | null, report: PredictedReport | null, clipId = labels?.clipId ?? 'unknown'): ClipScore {
  const base: ClipScore = {
    clipId, split: labels?.split ?? 'development', labelled: !!labels, synthetic: !!labels?.synthetic,
    claims: 0, claimsSupported: 0, claimsWrongPlayer: 0, claimsUnverified: 0, eventsPredicted: 0, eventsTruth: labels?.events.length ?? 0,
    eventsMatched: 0, timestampErrorSumSec: 0, answers: 0, answersSupported: 0, hasClaim: false, fullReport: false, usable: false,
    firstUsefulSec: report?.firstUsefulSec ?? null, fullSec: report?.fullSec ?? null,
  };
  if (!report) return base;
  const claims = [
    ...report.moments.filter((m) => CLAIM_STATES.has(m.identityState)).map((m): Interval => [m.start, m.end]),
    ...report.events.filter((e) => e.identityState === undefined || CLAIM_STATES.has(e.identityState)).map((e): Interval => [e.start, e.end]),
  ];
  base.claims = claims.length;
  base.hasClaim = claims.length > 0;
  base.fullReport = report.scope === 'full';
  if (labels) {
    for (const c of claims) {
      if (share(c, labels.absentIntervals) > 0.5) base.claimsWrongPlayer += 1;
      else if (share(c, labels.visibleIntervals) > 0.5) base.claimsSupported += 1;
      else base.claimsUnverified += 1;
    }
    // Only events claimed as the target enter the target-event precision/recall metric.
    const predicted = report.events.filter((e) => e.identityState === undefined || CLAIM_STATES.has(e.identityState));
    const scoreEvents = labels.eventsLabelled !== false;
    base.eventsPredicted = scoreEvents ? predicted.length : 0;
    base.eventsTruth = scoreEvents ? labels.events.length : 0;
    if (scoreEvents) {
      const matches = matchEvents(predicted, labels.events);
      base.eventsMatched = matches.matched; base.timestampErrorSumSec = matches.error;
    }
    // Narrative support: every answer cites frames it was actually given, inside the clip and not inside an absent interval.
    for (const a of report.answers ?? []) {
      base.answers += 1;
      const cited = a.answer.evidenceFrames ?? [];
      const clip = a.clip ?? report.moments.find((m) => m.id === a.momentId);
      const ok = cited.length > 0 && cited.every((id) => {
        const f = a.frames.find((x) => x.id === id);
        return !!f && !!clip && Number.isFinite(clip.start) && Number.isFinite(clip.end)
          && Number.isFinite(f.t) && f.t >= clip.start && f.t <= clip.end
          && inside(f.t, labels.visibleIntervals) && !inside(f.t, labels.absentIntervals);
      });
      if (ok) base.answersSupported += 1;
    }
  } else {
    base.eventsPredicted = report.events.length;
    for (const a of report.answers ?? []) {
      base.answers += 1;
      const cited = a.answer.evidenceFrames ?? [];
      if (cited.length > 0 && cited.every((id) => a.frames.some((x) => x.id === id))) base.answersSupported += 1;
    }
  }
  // With labels, usable also needs at least one claim a reviewer confirmed: sparse labels cannot show that an all-unverified report helps.
  base.usable = base.fullReport && base.hasClaim && base.claimsWrongPlayer === 0 && (!labels || base.claimsSupported > 0);
  return base;
}

export type SplitSummary = {
  split: Split; clips: number; labelledClips: number; syntheticClips: number;
  wrongPlayerClaims: number; claims: number; wrongPlayerRate: number | null; wrongPlayerRateCi95: [number, number] | null;
  supportedClaimShare: number | null; unverifiedClaims: number;
  eventPrecision: number | null; eventRecall: number | null; meanTimestampErrorSec: number | null;
  narrativeSupport: number | null; usableReports: number; usableShare: number | null; usableShareCi95: [number, number] | null;
  firstUsefulSec: { n: number; p50: number | null; p95: number | null };
  fullSec: { n: number; p50: number | null; p95: number | null };
  valid: boolean; invalidReasons: string[];
  labelFingerprint: string;
};

function pct(values: number[], q: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)];
}
const timing = (values: number[]) => ({ n: values.length, p50: pct(values, 0.5), p95: values.length >= MIN_P95_SAMPLES ? pct(values, 0.95) : null });

export function summarise(split: Split, scores: ClipScore[], labelsById: Map<string, ClipLabels>, otherSplitHashes: Set<string>): SplitSummary {
  const mine = scores.filter((s) => s.split === split);
  const labelled = mine.filter((s) => s.labelled);
  const claims = labelled.reduce((a, s) => a + s.claims, 0);
  const wrong = labelled.reduce((a, s) => a + s.claimsWrongPlayer, 0);
  const supported = labelled.reduce((a, s) => a + s.claimsSupported, 0);
  const predictedEvents = labelled.reduce((a, s) => a + s.eventsPredicted, 0);
  const matched = labelled.reduce((a, s) => a + s.eventsMatched, 0);
  const truth = labelled.reduce((a, s) => a + s.eventsTruth, 0);
  const answers = labelled.reduce((a, s) => a + s.answers, 0);
  const usable = labelled.filter((s) => s.usable).length;
  const invalid: string[] = [];
  if (split === 'heldout') {
    if (labelled.length < MIN_HELDOUT_CLIPS) invalid.push(`only ${labelled.length} labelled held-out clips; the proposed threshold file asks for at least ${MIN_HELDOUT_CLIPS}`);
    const lab = mine.map((s) => labelsById.get(s.clipId)).filter((l): l is ClipLabels => !!l);
    if (lab.some((l) => ![...l.visibleIntervals, ...l.absentIntervals].some(([s, e]) => e > s))) {
      invalid.push('held-out identity labels need reviewed presence or absence intervals');
    }
    if (lab.some((l) => l.synthetic !== false)) invalid.push('synthetic labels or labels without a real-data attestation are not held-out evidence');
    if (new Set(lab.map((l) => l.sourceSha256.toLowerCase())).size < MIN_HELDOUT_CLIPS) invalid.push(`held-out evidence needs at least ${MIN_HELDOUT_CLIPS} distinct source recordings`);
    if (lab.some((l) => l.blinded !== true)) invalid.push('some held-out labels lack a blinded-review attestation');
    if (lab.some((l) => new Set(l.reviewers.map((r) => r.trim().toLowerCase()).filter(Boolean)).size < 2)) invalid.push('held-out labels need two distinct reviewers');
    if (lab.some((l) => otherSplitHashes.has(l.sourceSha256.toLowerCase()))) invalid.push('a held-out source recording is also in the development split');
  } else if (mine.length && labelled.length === 0) {
    invalid.push('no labelled development clips: only structural checks ran');
  }
  return {
    labelFingerprint: createHash('sha256').update(JSON.stringify(mine.map((s) => [s.clipId, labelsById.get(s.clipId) ?? null])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))))).digest('hex'),
    split, clips: mine.length, labelledClips: labelled.length, syntheticClips: mine.filter((s) => s.synthetic).length,
    wrongPlayerClaims: wrong, claims, wrongPlayerRate: ratio(wrong, supported + wrong), wrongPlayerRateCi95: wilson(wrong, supported + wrong),
    supportedClaimShare: ratio(supported, claims), unverifiedClaims: labelled.reduce((a, s) => a + s.claimsUnverified, 0),
    eventPrecision: ratio(matched, predictedEvents), eventRecall: ratio(matched, truth),
    meanTimestampErrorSec: matched ? labelled.reduce((a, s) => a + s.timestampErrorSumSec, 0) / matched : null,
    narrativeSupport: ratio(labelled.reduce((a, s) => a + s.answersSupported, 0), answers),
    usableReports: usable, usableShare: ratio(usable, labelled.length), usableShareCi95: wilson(usable, labelled.length),
    firstUsefulSec: timing(mine.flatMap((s) => (s.firstUsefulSec === null ? [] : [s.firstUsefulSec]))),
    fullSec: timing(mine.flatMap((s) => (s.fullSec === null ? [] : [s.fullSec]))),
    valid: invalid.length === 0 && mine.length > 0, invalidReasons: invalid,
  };
}

export type CorpusClip = { labels: ClipLabels | null; report: PredictedReport | null; clipId: string; split: Split };
export type Thresholds = { eventMetrics?: Record<string, { min?: number; max?: number }>; metrics?: Record<string, { min?: number; max?: number }> };

export function scoreCorpus(clips: CorpusClip[], thresholds: Thresholds = {}) {
  const seen = new Set<string>();
  for (const c of clips) {
    if (!c.clipId || seen.has(c.clipId)) throw new Error('clip ids must be non-empty and unique');
    seen.add(c.clipId);
    if (c.split !== 'development' && c.split !== 'heldout') throw new Error(`invalid split for ${c.clipId}`);
    const l = c.labels;
    const report = c.report;
    if (report && [...report.moments, ...report.events].some((m) => !Number.isFinite(m.start) || !Number.isFinite(m.end) || m.start < 0 || m.end < m.start)) {
      throw new Error(`invalid report timestamp for ${c.clipId}`);
    }
    if (report && [report.firstUsefulSec, report.fullSec].some((t) => t != null && (!Number.isFinite(t) || t < 0))) {
      throw new Error(`invalid timing for ${c.clipId}`);
    }
    if (!l) continue;
    if (l.clipId !== c.clipId || l.split !== c.split) throw new Error(`label identity/split mismatch for ${c.clipId}`);
    if (!/^[a-f0-9]{64}$/i.test(l.sourceSha256)) throw new Error(`invalid source hash for ${c.clipId}`);
    const intervals = [...l.visibleIntervals, ...l.absentIntervals];
    if (intervals.some(([s, e]) => !Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e < s)) throw new Error(`invalid label interval for ${c.clipId}`);
    if (l.visibleIntervals.some((v) => overlapSec(v, l.absentIntervals) > 0)) throw new Error(`conflicting presence/absence labels for ${c.clipId}`);
    if (l.events.some((e) => !Number.isFinite(e.t) || e.t < 0)) throw new Error(`invalid event timestamp for ${c.clipId}`);
  }
  const scores = clips.map((c) => ({ ...scoreClip(c.labels, c.report, c.clipId), split: c.split }));
  const labelsById = new Map(clips.flatMap((c) => (c.labels ? [[c.clipId, c.labels] as const] : [])));
  const hashes = (split: Split) => new Set(clips.filter((c) => c.split === split && c.labels).map((c) => c.labels!.sourceSha256.toLowerCase()));
  const development = summarise('development', scores, labelsById, hashes('heldout'));
  const heldout = summarise('heldout', scores, labelsById, hashes('development'));
  const limit = (name: string) => thresholds.metrics?.[name] ?? thresholds.eventMetrics?.[name];
  const check = (s: SplitSummary) => ({
    falseConfirmRate: limit('falseConfirmRate')?.max === undefined || s.wrongPlayerRate === null ? null : s.wrongPlayerRate <= limit('falseConfirmRate')!.max!,
    eventPrecision: limit('eventPrecision')?.min === undefined || s.eventPrecision === null ? null : s.eventPrecision >= limit('eventPrecision')!.min!,
    eventRecall: limit('eventRecall')?.min === undefined || s.eventRecall === null ? null : s.eventRecall >= limit('eventRecall')!.min!,
    meanTimestampErrorSec: limit('meanTimestampErrorSec')?.max === undefined || s.meanTimestampErrorSec === null ? null : s.meanTimestampErrorSec <= limit('meanTimestampErrorSec')!.max!,
  });
  return {
    evaluator: 'pitchproof-report-eval/1',
    development: { ...development, thresholdChecks: check(development) },
    heldout: { ...heldout, thresholdChecks: check(heldout) },
    // Development numbers can never establish release readiness; only a valid held-out summary can, and thresholds are still "proposed".
    releaseEvidence: heldout.valid ? 'heldout_present_thresholds_still_proposed' : 'insufficient',
    perClip: scores,
  };
}

export type RunComparison = { accepted: boolean; reasons: string[] };

/**
 * Gate for an optimisation: same clips, same split. Rejects anything that adds a wrong-player claim, lowers the usable
 * share, loses recall (even when precision rises because fewer events are reported), or weakens citation support.
 */
export function compareRuns(before: SplitSummary, after: SplitSummary, clipsBefore: string[], clipsAfter: string[]): RunComparison {
  const reasons: string[] = [];
  if (!before.valid) reasons.push('baseline split is not valid evidence');
  if (before.labelFingerprint !== after.labelFingerprint) reasons.push('different labels');
  if (before.split !== after.split) reasons.push('different splits');
  if (clipsBefore.length !== clipsAfter.length || clipsBefore.some((c, i) => c !== clipsAfter[i])) reasons.push('not the same clips');
  if (after.wrongPlayerClaims > before.wrongPlayerClaims) reasons.push(`wrong-player claims ${before.wrongPlayerClaims} -> ${after.wrongPlayerClaims}`);
  const drop = (a: number | null, b: number | null, tol: number) => a !== null && (b === null || b < a - tol);
  if (drop(before.usableShare, after.usableShare, 0)) reasons.push(`usable share ${before.usableShare} -> ${after.usableShare}`);
  if (drop(before.eventRecall, after.eventRecall, 0.02)) reasons.push(`event recall ${before.eventRecall} -> ${after.eventRecall}`);
  if (drop(before.supportedClaimShare, after.supportedClaimShare, 0.02)) reasons.push(`supported claim share ${before.supportedClaimShare} -> ${after.supportedClaimShare}`);
  if (drop(before.narrativeSupport, after.narrativeSupport, 0.02)) reasons.push(`narrative support ${before.narrativeSupport} -> ${after.narrativeSupport}`);
  if (before.meanTimestampErrorSec !== null && after.meanTimestampErrorSec !== null && after.meanTimestampErrorSec > before.meanTimestampErrorSec + 0.25) {
    reasons.push(`timestamp error ${before.meanTimestampErrorSec} -> ${after.meanTimestampErrorSec}`);
  }
  if (before.usableReports > 0 && after.usableReports === 0) reasons.push('no usable report remains');
  if (!after.valid) reasons.push(`after-run split is not valid evidence: ${after.invalidReasons.join('; ') || 'no clips'}`);
  return { accepted: reasons.length === 0, reasons };
}

/** Accepts a worker-test fixture ({report}) or a bare published report. */
export function adaptReport(json: unknown, extra: Partial<PredictedReport> = {}): PredictedReport {
  const root = json as { report?: Record<string, unknown>; scope?: string };
  const r = (root.report ?? root) as { moments?: ReportMoment[]; events?: ReportEvent[]; analysedRange?: { parts?: number } };
  return {
    scope: root.scope === 'preliminary' || root.scope === 'full' ? root.scope : undefined,
    moments: (r.moments ?? []).map((m) => ({ id: m.id, kind: m.kind, start: m.start, end: m.end, identityState: m.identityState })),
    events: (r.events ?? []).map((e) => ({ type: e.type, start: e.start, end: e.end, ...(e.identityState ? { identityState: e.identityState } : {}) })),
    ...extra,
  };
}

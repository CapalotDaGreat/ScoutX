/**
 * Player tracking v3: server-side contract, validation and owner callables.
 *
 * The GPU worker (workers/football-cv, scoutx_tracker) returns a `pitchproof.tracking.v3` report.
 * Functions re-validates it here - shape, bounds and the numerical invariants - and persists a
 * TARGET-ONLY view at matchAnalysisJobs/{jobId}/tracking/current. Other players' tracklets, number
 * reads and exclusion lists never reach Firestore.
 *
 * Identity corrections ("yes / not me / unsure / skip") are stored per job in
 * tracking/feedback, mark the current report stale (dependent stats are invalidated immediately)
 * and are used only for this match. They are never used as model-training data.
 *
 * Nothing here enables the worker: calling it still requires the existing approval gates
 * (cvWorkerStatus() === 'available') plus TRACKING_V3_ENABLED=true.
 */

export const TRACKING_SCHEMA = 'pitchproof.tracking.v3';
export const TRACKING_COLLECTION = 'tracking';

export const IDENTITY_STATES = [
  'CONFIRMED_VISIBLE', 'LIKELY_VISIBLE', 'AMBIGUOUS', 'OFF_CAMERA', 'CONFIRMED_OFF_PITCH', 'NON_MATCH_PERIOD', 'UNKNOWN',
] as const;
export type IdentityState = (typeof IDENTITY_STATES)[number];

export type Provenance = 'calibrated' | 'estimate_experimental' | 'unavailable' | 'model_estimate_unvalidated';
export type MetricValue = { value: number | null; unit: string; provenance: Provenance; method: string; note?: string };

export type TrackingCoverage = {
  recordingSec: number; nonMatchSec: number; offPitchSec: number; matchSec: number; unobservedSec: number;
  analysedSec: number; confirmedVisibleSec: number; likelyVisibleSec: number; ambiguousSec: number; notIdentifiedSec: number;
};

export type TrackingPeriod = { start: number; end: number; kind: 'play' | 'non_play' | 'unobserved'; label: string; source: 'detected' | 'user' };
export type TrackingRun = { start: number; end: number; durationSec: number; peakKmh: number; distanceM: number };
export type TrackingEvent = {
  type: 'contact' | 'carry' | 'pass_attempt' | 'duel_candidate' | 'tackle_candidate'; start: number; end: number;
  identityState: IdentityState; outcome?: 'completed' | 'incomplete' | 'unknown'; outcomeEvidence?: string;
  evidenceTimes: number[]; confidence: number;
  /** Duel/tackle candidates need review and are never counted as statistics. */
  candidate?: true;
};
const EVENT_TYPES = ['contact', 'carry', 'pass_attempt', 'duel_candidate', 'tackle_candidate'];
export const MOMENT_KINDS = ['contact', 'carry', 'pass_attempt', 'duel_candidate', 'tackle_candidate', 'spell'] as const;
export type MomentKind = (typeof MOMENT_KINDS)[number];
/**
 * A watchable clip window around the target's own measured action (or a confirmed on-camera
 * spell). Built by the worker from existing events/identity only - never a new football event.
 */
export type TrackingMoment = {
  id: string; kind: MomentKind; kinds: MomentKind[]; start: number; end: number; clipStart: number; clipEnd: number;
  identityState: 'CONFIRMED_VISIBLE' | 'LIKELY_VISIBLE'; candidate: boolean; outcome?: 'completed' | 'incomplete' | 'unknown';
  /** [t, x, y, w, h] normalised target box samples inside the clip (target indicator). */
  indicator: Array<[number, number, number, number, number]>;
  imagePath?: string | null;
};
export const MAX_MOMENTS = 80;
export const MAX_CLIP_SEC = 20;
export type ReviewQuestion = {
  id: string; t: number; box: [number, number, number, number]; affectedSec: number; currentlyTarget: boolean;
  score: number; imagePath?: string | null;
};

export type TrackingReport = {
  schema: typeof TRACKING_SCHEMA;
  engineVersion: string;
  target: { number: string | null; kit: string; kit2: string; position: string };
  coverage: TrackingCoverage;
  periods: TrackingPeriod[];
  statesSec: Partial<Record<IdentityState, number>>;
  /** Run-length encoded per-second state strip for the timeline UI. */
  stateStrip: Array<[number, number, IdentityState]>;
  physical: {
    status: 'calibrated' | 'experimental' | 'unavailable';
    productionVisible: boolean;
    reason: string | null;
    values: Record<string, MetricValue>;
    sprints: TrackingRun[];
    highSpeedRuns: TrackingRun[];
    thresholds: { sprint_kmh: number; hsr_kmh: number };
  };
  ball: { contacts: number; carries: number; passAttempts: number; completedPasses: number; incompletePasses: number;
    unknownOutcomePasses: number; contactsConfirmedIdentity: number; duelCandidates: number; tackleCandidates: number;
    provenance: Provenance };
  events: TrackingEvent[];
  reviewQuestions: ReviewQuestion[];
  identity: { numberSightings: number; confirmedByUser: number };
  heatmap: { status: 'observed_only' | 'unavailable'; reason?: string };
  /** Owner-only Storage path of a number-confirmed sighting, shown next to each review card. */
  referenceImagePath?: string | null;
  moments: TrackingMoment[];
  /** Part of the recording covered by this report. A partial (preliminary) report covers less. */
  analysedRange: { startSec: number; endSec: number; parts: number };
  /** Source frame size; turns a moment's normalised target box into an identity answer point. */
  videoSize: { width: number; height: number } | null;
};

/** Decodes the worker's small review-card JPEGs (bounded size, JPEG magic bytes checked). */
export function decodeReviewImage(b64: unknown): Buffer | null {
  if (typeof b64 !== 'string' || b64.length === 0 || b64.length > 200_000 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return null;
  const buf = Buffer.from(b64, 'base64');
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff ? buf : null;
}

export function reviewImagePath(uid: string, jobId: string, name: string): string {
  return `profiles/${uid}/matchFootage/${jobId}/tracking/${name.replace(/[^A-Za-z0-9_-]/g, '_')}.jpg`;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nonNeg = (v: unknown): v is number => isNum(v) && v >= 0;
const EPS = 0.6;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Numerical invariants the report must satisfy (mirrors scoutx_tracker/invariants.py). */
export function trackingInvariantViolations(r: TrackingReport): string[] {
  const v: string[] = [];
  const c = r.coverage;
  if (Math.abs(c.nonMatchSec + c.offPitchSec + c.matchSec - c.recordingSec) > EPS) v.push('coverage_partition');
  if (Math.abs(c.unobservedSec + c.analysedSec - c.matchSec) > EPS) v.push('coverage_match');
  if (Math.abs(c.confirmedVisibleSec + c.likelyVisibleSec + c.ambiguousSec + c.notIdentifiedSec - c.analysedSec) > EPS) {
    v.push('coverage_states');
  }
  const peak = r.physical.values.peakSpeed?.value ?? null;
  for (const run of [...r.physical.sprints, ...r.physical.highSpeedRuns]) {
    if (peak !== null && run.peakKmh > peak + 0.05) v.push('peak_inconsistent');
    if (run.start < 0 || run.end < run.start || run.end > c.recordingSec + EPS) v.push('run_bounds');
  }
  if ((r.physical.values.sprintCount?.value ?? r.physical.sprints.length) !== r.physical.sprints.length) v.push('sprint_count');
  if (r.physical.productionVisible && r.physical.status !== 'calibrated') v.push('uncalibrated_visible');
  for (const e of r.events) {
    if (e.start < 0 || e.end < e.start || e.end > c.recordingSec + EPS) v.push('event_bounds');
    if (e.outcome === 'completed' && e.outcomeEvidence !== 'verified') v.push('unverified_completed_pass');
  }
  if (r.ball.completedPasses + r.ball.incompletePasses + r.ball.unknownOutcomePasses !== r.ball.passAttempts) v.push('pass_partition');
  return [...new Set(v)];
}

function parseRuns(raw: unknown): TrackingRun[] | null {
  if (!Array.isArray(raw) || raw.length > 500) return null;
  const out: TrackingRun[] = [];
  for (const item of raw) {
    const r = asRecord(item);
    if (!r || !nonNeg(r.start) || !nonNeg(r.end) || !nonNeg(r.durationSec) || !nonNeg(r.peakKmh) || !nonNeg(r.distanceM)) return null;
    out.push({ start: r.start, end: r.end, durationSec: r.durationSec, peakKmh: r.peakKmh, distanceM: r.distanceM });
  }
  return out;
}

/**
 * Builds the target-only persisted report from the worker's raw v3 output. Returns null for
 * anything malformed or internally inconsistent - an inconsistent report is never shown.
 */
export function parseTrackingReport(raw: unknown, timeline?: { states: string[]; times: number[] }): TrackingReport | null {
  const r = asRecord(raw);
  if (!r || r.schema !== TRACKING_SCHEMA) return null;
  const cov = asRecord(r.coverage);
  const keys: Array<keyof TrackingCoverage> = ['recordingSec', 'nonMatchSec', 'offPitchSec', 'matchSec', 'unobservedSec',
    'analysedSec', 'confirmedVisibleSec', 'likelyVisibleSec', 'ambiguousSec', 'notIdentifiedSec'];
  if (!cov || !keys.every((k) => nonNeg(cov[k]))) return null;
  const coverage = Object.fromEntries(keys.map((k) => [k, cov[k] as number])) as TrackingCoverage;
  const target = asRecord(r.target);
  const phys = asRecord(r.physical);
  const ball = asRecord(r.ball);
  const ident = asRecord(r.identity);
  const tl = asRecord(r.timeline);
  if (!target || !phys || !ball || !ident || !tl || !Array.isArray(tl.periods)) return null;

  const periods: TrackingPeriod[] = [];
  for (const p of tl.periods as unknown[]) {
    const pr = asRecord(p);
    if (!pr || !nonNeg(pr.start) || !nonNeg(pr.end) || (pr.end as number) < (pr.start as number)
      || !['play', 'non_play', 'unobserved'].includes(String(pr.kind))) return null;
    periods.push({ start: pr.start as number, end: pr.end as number, kind: pr.kind as TrackingPeriod['kind'],
      label: String(pr.label).slice(0, 40), source: pr.source === 'user' ? 'user' : 'detected' });
  }
  const statesRaw = asRecord(ident.statesSec) ?? {};
  const statesSec: Partial<Record<IdentityState, number>> = {};
  for (const s of IDENTITY_STATES) if (nonNeg(statesRaw[s])) statesSec[s] = statesRaw[s] as number;

  const valuesRaw = asRecord(phys.values) ?? {};
  const values: Record<string, MetricValue> = {};
  for (const [k, item] of Object.entries(valuesRaw)) {
    const m = asRecord(item);
    if (!m) return null;
    const provenance = String(m.provenance) as Provenance;
    if (!['calibrated', 'estimate_experimental', 'unavailable'].includes(provenance)) return null;
    if (m.value !== null && !isNum(m.value)) return null;
    values[k] = { value: (m.value as number | null), unit: String(m.unit).slice(0, 12), provenance,
      method: String(m.method ?? '').slice(0, 300), ...(m.note ? { note: String(m.note).slice(0, 200) } : {}) };
  }
  const sprints = parseRuns(phys.sprints);
  const highSpeedRuns = parseRuns(phys.highSpeedRuns);
  const thresholds = asRecord(phys.thresholds);
  if (!sprints || !highSpeedRuns || !thresholds || !nonNeg(thresholds.sprint_kmh) || !nonNeg(thresholds.hsr_kmh)) return null;
  const status = String(phys.status);
  if (!['calibrated', 'experimental', 'unavailable'].includes(status)) return null;

  const events: TrackingEvent[] = [];
  if (!Array.isArray(r.events) || r.events.length > 2000) return null;
  for (const item of r.events) {
    const e = asRecord(item);
    if (!e || !EVENT_TYPES.includes(String(e.type)) || !nonNeg(e.start) || !nonNeg(e.end)
      || !IDENTITY_STATES.includes(e.identityState as IdentityState) || !isNum(e.confidence)) return null;
    // Only events on the target's claimed frames are kept.
    if (!['CONFIRMED_VISIBLE', 'LIKELY_VISIBLE'].includes(String(e.identityState))) continue;
    events.push({
      type: e.type as TrackingEvent['type'], start: e.start as number, end: e.end as number,
      identityState: e.identityState as IdentityState,
      ...(e.outcome ? { outcome: (['completed', 'incomplete'].includes(String(e.outcome)) ? e.outcome : 'unknown') as TrackingEvent['outcome'] } : {}),
      ...(e.outcomeEvidence ? { outcomeEvidence: String(e.outcomeEvidence).slice(0, 60) } : {}),
      evidenceTimes: Array.isArray(e.evidenceTimes) ? (e.evidenceTimes as unknown[]).filter(nonNeg).slice(0, 8) : [],
      confidence: Math.max(0, Math.min(1, e.confidence as number)),
      ...(String(e.type).endsWith('_candidate') ? { candidate: true as const } : {}),
    });
  }
  const counts = (k: string) => (nonNeg(ball[k]) ? Math.floor(ball[k] as number) : 0);
  const questions: ReviewQuestion[] = [];
  for (const item of Array.isArray(r.reviewQuestions) ? r.reviewQuestions.slice(0, 12) : []) {
    const q = asRecord(item);
    const box = q?.box;
    if (!q || !nonNeg(q.t) || !Array.isArray(box) || box.length !== 4 || !box.every(nonNeg) || !nonNeg(q.affectedSec)) return null;
    questions.push({ id: `q_${Math.round((q.t as number) * 10)}_${Math.round(box[0] as number)}`, t: q.t as number,
      box: box as [number, number, number, number], affectedSec: q.affectedSec as number,
      currentlyTarget: q.currentlyTarget === true, score: isNum(q.score) ? q.score : 0, imagePath: null });
  }
  const moments = parseMoments(r.moments, coverage.recordingSec);
  if (!moments) return null;
  const range = asRecord(r.analysedRange);
  const analysedRange = range && nonNeg(range.startSec) && nonNeg(range.endSec) && nonNeg(range.parts)
    && (range.endSec as number) >= (range.startSec as number)
    ? { startSec: range.startSec as number, endSec: range.endSec as number, parts: Math.floor(range.parts as number) }
    : { startSec: 0, endSec: coverage.recordingSec, parts: 0 };
  const heatRaw = asRecord(r.heatmap);
  const report: TrackingReport = {
    schema: TRACKING_SCHEMA,
    engineVersion: String(asRecord(r.engine)?.version ?? 'unknown').slice(0, 40),
    target: { number: target.number ? String(target.number).slice(0, 3) : null, kit: String(target.kit ?? '').slice(0, 40),
      kit2: String(target.kit2 ?? '').slice(0, 40), position: String(target.position ?? 'unknown').slice(0, 30) },
    coverage, periods, statesSec,
    stateStrip: timeline ? encodeStateStrip(timeline.times, timeline.states) : [],
    physical: { status: status as TrackingReport['physical']['status'],
      productionVisible: phys.productionVisible === true && status === 'calibrated',
      reason: phys.reason ? String(phys.reason).slice(0, 300) : null, values, sprints, highSpeedRuns,
      thresholds: { sprint_kmh: thresholds.sprint_kmh as number, hsr_kmh: thresholds.hsr_kmh as number } },
    ball: { contacts: counts('contacts'), carries: counts('carries'), passAttempts: counts('passAttempts'),
      completedPasses: counts('completedPasses'), incompletePasses: counts('incompletePasses'),
      unknownOutcomePasses: counts('unknownOutcomePasses'), contactsConfirmedIdentity: counts('contactsConfirmedIdentity'),
      duelCandidates: counts('duelCandidates'), tackleCandidates: counts('tackleCandidates'), provenance: 'model_estimate_unvalidated' },
    events,
    moments,
    analysedRange,
    videoSize: (() => {
      const v = asRecord(r.videoSize);
      return v && isNum(v.width) && isNum(v.height) && v.width > 0 && v.height > 0 && v.width <= 8192 && v.height <= 8192
        ? { width: v.width, height: v.height } : null;
    })(),
    reviewQuestions: questions,
    identity: { numberSightings: nonNeg(ident.numberSightings) ? ident.numberSightings as number : 0,
      confirmedByUser: nonNeg(ident.confirmedByUser) ? ident.confirmedByUser as number : 0 },
    heatmap: heatRaw && heatRaw.status === 'observed_only' ? { status: 'observed_only' }
      : { status: 'unavailable', reason: String(heatRaw?.reason ?? 'No validated pitch calibration for this recording.').slice(0, 200) },
  };
  return trackingInvariantViolations(report).length === 0 ? report : null;
}

/**
 * Validates the worker's moments. Anything not on claimed target frames, outside the recording,
 * longer than MAX_CLIP_SEC or of an unknown kind invalidates the whole report (never shown).
 */
export function parseMoments(raw: unknown, recordingSec: number): TrackingMoment[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_MOMENTS) return null;
  const out: TrackingMoment[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    const m = asRecord(item);
    if (!m || typeof m.id !== 'string' || !/^m_[0-9]{1,6}$/.test(m.id) || ids.has(m.id)) return null;
    if (!MOMENT_KINDS.includes(m.kind as MomentKind)) return null;
    if (!['CONFIRMED_VISIBLE', 'LIKELY_VISIBLE'].includes(String(m.identityState))) return null;
    if (![m.start, m.end, m.clipStart, m.clipEnd].every(nonNeg)) return null;
    const [start, end, c0, c1] = [m.start, m.end, m.clipStart, m.clipEnd] as number[];
    if (end < start || c1 < c0 || c1 - c0 > MAX_CLIP_SEC + 0.01 || (recordingSec > 0 && c1 > recordingSec + 0.5)) return null;
    const kinds = Array.isArray(m.kinds) ? (m.kinds as unknown[]).filter((k): k is MomentKind => MOMENT_KINDS.includes(k as MomentKind)) : [];
    const candidate = m.candidate === true;
    // A candidate flag must agree with the kind: duel/tackle candidates are never presented as actions.
    if (candidate !== String(m.kind).endsWith('_candidate')) return null;
    const indicator: TrackingMoment['indicator'] = [];
    for (const p of Array.isArray(m.indicator) ? (m.indicator as unknown[]).slice(0, 60) : []) {
      if (!Array.isArray(p) || p.length !== 5 || !p.every(isNum)) return null;
      const [t, x, y, w, h] = p as number[];
      if (t < c0 - 0.01 || t > c1 + 0.01 || [x, y, w, h].some((v) => v < -0.05 || v > 1.05)) return null;
      indicator.push([t, x, y, w, h]);
    }
    ids.add(m.id);
    out.push({ id: m.id, kind: m.kind as MomentKind, kinds: kinds.length ? kinds : [m.kind as MomentKind], start, end,
      clipStart: c0, clipEnd: c1, identityState: m.identityState as TrackingMoment['identityState'], candidate,
      ...(m.outcome ? { outcome: (['completed', 'incomplete'].includes(String(m.outcome)) ? m.outcome : 'unknown') as TrackingMoment['outcome'] } : {}),
      indicator, imagePath: null });
  }
  return out.sort((a, b) => a.clipStart - b.clipStart);
}

/** Per-second majority state, run-length encoded: [startSec, endSec, state]. */
export function encodeStateStrip(times: number[], states: string[]): Array<[number, number, IdentityState]> {
  const out: Array<[number, number, IdentityState]> = [];
  if (times.length !== states.length || times.length === 0) return out;
  let sec = Math.floor(times[0]);
  let bucket: Record<string, number> = {};
  const flush = () => {
    const entries = Object.entries(bucket);
    if (!entries.length) return;
    const best = entries.sort((a, b) => b[1] - a[1])[0][0] as IdentityState;
    const last = out[out.length - 1];
    if (last && last[2] === best && last[1] === sec) last[1] = sec + 1;
    else out.push([sec, sec + 1, best]);
  };
  for (let i = 0; i < times.length; i += 1) {
    const s = Math.floor(times[i]);
    if (s !== sec) {
      flush();
      bucket = {};
      sec = s;
    }
    const st = IDENTITY_STATES.includes(states[i] as IdentityState) ? states[i] : 'UNKNOWN';
    bucket[st] = (bucket[st] ?? 0) + 1;
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------- feedback model

export const ANSWERS = ['yes', 'not_me', 'unsure', 'skip'] as const;
export type Answer = (typeof ANSWERS)[number];

export type FeedbackEntry = { questionId: string; answer: Answer; t: number; point: [number, number]; operationId: string; at: string };
export type TrackingFeedback = {
  entries: FeedbackEntry[];
  periods: { kickoff?: number; halftimeStart?: number; secondHalfStart?: number; fulltime?: number };
  offPitch: Array<[number, number]>;
};

export function emptyFeedback(): TrackingFeedback {
  return { entries: [], periods: {}, offPitch: [] };
}

/** Applies one answer idempotently. Returns null if the question is unknown. */
export function applyAnswer(feedback: TrackingFeedback, report: TrackingReport, questionId: string, answer: Answer,
  operationId: string, now: string): TrackingFeedback | null {
  if (feedback.entries.some((e) => e.operationId === operationId)) return feedback;
  const target = answerTarget(report, questionId);
  if (!target) return null;
  const entries = feedback.entries.filter((e) => e.questionId !== questionId);
  return { ...feedback, entries: [...entries, { questionId, answer, t: target.t, point: target.point, operationId, at: now }].slice(-500) };
}

/**
 * Where an identity answer points: a review question's box, or - "Is this you?" asked while
 * watching a moment - the moment's target indicator sample nearest the middle of the action.
 * The answer is per-match feedback only (never training data).
 */
export function answerTarget(report: TrackingReport, id: string): { t: number; point: [number, number] } | null {
  const q = report.reviewQuestions.find((item) => item.id === id);
  if (q) return { t: q.t, point: [(q.box[0] + q.box[2]) / 2, (q.box[1] + q.box[3]) / 2] };
  const m = (report.moments ?? []).find((item) => item.id === id);
  if (!m || !report.videoSize || m.indicator.length === 0) return null;
  const mid = (m.start + m.end) / 2;
  const s = m.indicator.reduce((best, p) => (Math.abs(p[0] - mid) < Math.abs(best[0] - mid) ? p : best));
  const { width, height } = report.videoSize;
  return { t: s[0], point: [(s[1] + s[3] / 2) * width, (s[2] + s[4] / 2) * height] };
}

export function undoLast(feedback: TrackingFeedback): TrackingFeedback {
  return { ...feedback, entries: feedback.entries.slice(0, -1) };
}

/** Feedback in the worker's format: yes/no points; unsure and skip carry no identity evidence. */
export function workerFeedback(feedback: TrackingFeedback): {
  yes: number[][]; no: number[][]; periods: TrackingFeedback['periods']; offPitch: Array<[number, number]>; asked: number[][];
} {
  const pt = (e: FeedbackEntry) => [e.t, e.point[0], e.point[1]];
  return {
    yes: feedback.entries.filter((e) => e.answer === 'yes').map(pt),
    no: feedback.entries.filter((e) => e.answer === 'not_me').map(pt),
    periods: feedback.periods,
    offPitch: feedback.offPitch,
    // Unsure/skip carry no identity evidence; they only stop the same player being asked again.
    asked: feedback.entries.filter((e) => e.answer === 'unsure' || e.answer === 'skip').map(pt),
  };
}

export function validPeriods(p: TrackingFeedback['periods'], durationSec: number): boolean {
  const vals = [p.kickoff, p.halftimeStart, p.secondHalfStart, p.fulltime];
  if (!vals.every((x) => x === undefined || (nonNeg(x) && x <= durationSec))) return false;
  const ordered = vals.filter((x): x is number => x !== undefined);
  for (let i = 1; i < ordered.length; i += 1) if (ordered[i] <= ordered[i - 1]) return false;
  return (p.halftimeStart === undefined) === (p.secondHalfStart === undefined);
}

export function trackingV3Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TRACKING_V3_ENABLED?.trim() === 'true';
}

/**
 * EXPERIMENTAL clip-review contract (CLIP-EXP-1). Not imported by the app; not a production default.
 *
 * A clip review says something narrow about ONE continuous clip of the selected player. It never assesses the match,
 * never lowers the match-level coaching gate, and returns a specific insufficiency reason plus a recovery action when
 * a clip cannot support feedback.
 *
 * Every item needs:
 *  - frame-level CONFIRMED_VISIBLE identity for the whole clip (no LIKELY/AMBIGUOUS frame, no gap > 0.55 s);
 *    the 1-s majority state strip is not enough (see the ledger: it drops and could admit clips wrongly);
 *  - at least MIN_CLIP_SEC of context and a measured observable (nearest-opponent distance in body heights,
 *    image plane, on most frames), with values that actually support the stated pattern;
 *  - no owner "not me" correction near the clip; owner "this is me" taps inside or just before the clip mark it
 *    owner-assisted (a tap is not proof of every later continuation, so the source is reported, not hidden);
 *  - the observation, the uncertain interpretation and the practice suggestion kept apart.
 * Not stated, ever: speed, distance in metres, team-mates off screen, intent, whether an action succeeded.
 */

export const CLIP_REVIEW_EXPERIMENT = 'clip-review-exp-1' as const;
export const MIN_CLIP_SEC = 6;
const MAX_GAP_SEC = 0.55;
const EDGE_SEC = 0.15;
const FREE_SHARE = 0.7; // worker SEQ_FREE_SHARE
const TIGHT_SHARE = 0.6; // worker SEQ_TIGHT_SHARE
const MEASURED_SHARE = 0.7; // worker SEQ_MEASURED_SHARE
const CORRECTION_MARGIN_SEC = 2;
const TAP_LOOKBACK_SEC = 10;

export type FrameTimeline = { times: number[]; states: string[]; present: boolean[] };
export type WorkerSequence = {
  start: number; end: number; kind: string; measuredSec?: number; nearestOpponentMedianBH?: number;
  freeShare?: number; tightShare?: number;
};
export type OwnerAnswer = { t: number; answer: 'is_me' | 'not_me' };
export type Line = 'defence' | 'midfield' | 'attack' | 'general';

export type InsufficiencyReason =
  | 'identity_not_confirmed_throughout' | 'too_short' | 'not_measurable' | 'no_clear_pattern'
  | 'unsupported_values' | 'contradictory' | 'owner_correction_nearby' | 'outside_recording';
export const RECOVERY: Record<InsufficiencyReason, string> = {
  identity_not_confirmed_throughout: 'confirm_identity_in_review',
  too_short: 'none_needs_longer_clip',
  not_measurable: 'record_closer_or_wider',
  no_clear_pattern: 'none_watch_clip',
  unsupported_values: 'report_to_support',
  contradictory: 'none_watch_clip',
  owner_correction_nearby: 'reanalyse_after_corrections',
  outside_recording: 'report_to_support',
};

export type ClipItem = {
  clip: { start: number; end: number };
  kind: 'strength' | 'improve' | 'observation';
  identitySource: 'automatic' | 'owner_assisted';
  observation: { pattern: 'free' | 'tight'; seconds: number; sharePct: number; nearestOpponentMedianBH: number };
  /** template ids; the text is filled only with the numbers above */
  observationKey: string;
  interpretationKey: string; // always phrased as uncertain
  practice: { drillId: string; successKey: string } | null;
  scope: 'this_clip_only';
  limitations: string[];
  text: string;
  textSource: 'template' | 'provider' | 'template_after_provider_failure' | 'template_after_provider_rejected';
};
export type ClipReview = {
  experiment: typeof CLIP_REVIEW_EXPERIMENT;
  basedOn: { answersFingerprint: string };
  items: ClipItem[];
  insufficient: Array<{ clip: { start: number; end: number }; reason: InsufficiencyReason; recovery: string }>;
};
export type Provider = (item: Omit<ClipItem, 'text' | 'textSource'>) => Promise<string>;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Frame-level identity check: every sample inside the clip is present and CONFIRMED_VISIBLE, edges covered, no gap. */
export function confirmedThroughout(tl: FrameTimeline, start: number, end: number): boolean {
  let first: number | null = null;
  let prev: number | null = null;
  for (let i = 0; i < tl.times.length; i += 1) {
    const t = tl.times[i];
    if (t < start || t > end) continue;
    if (!tl.present[i] || tl.states[i] !== 'CONFIRMED_VISIBLE') return false;
    if (prev !== null && t - prev > MAX_GAP_SEC) return false;
    if (first === null) first = t;
    prev = t;
  }
  return first !== null && prev !== null && first <= start + EDGE_SEC && prev >= end - EDGE_SEC;
}

function judge(q: WorkerSequence, all: WorkerSequence[], tl: FrameTimeline, recordingSec: number, answers: OwnerAnswer[]):
  InsufficiencyReason | null {
  if (!finite(q.start) || !finite(q.end) || q.start < 0 || q.end > recordingSec + EDGE_SEC || q.end <= q.start) return 'outside_recording';
  if (q.end - q.start < MIN_CLIP_SEC - 0.05) return 'too_short';
  if (answers.some((a) => a.answer === 'not_me' && a.t >= q.start - CORRECTION_MARGIN_SEC && a.t <= q.end + CORRECTION_MARGIN_SEC)) {
    return 'owner_correction_nearby';
  }
  if (!confirmedThroughout(tl, q.start, q.end)) return 'identity_not_confirmed_throughout';
  if (all.some((o) => o !== q && o.start < q.end && o.end > q.start && o.kind !== q.kind)) return 'contradictory';
  if (q.kind === 'unmeasured') return 'not_measurable';
  if (q.kind !== 'free' && q.kind !== 'tight') return 'no_clear_pattern';
  const share = (v: unknown) => finite(v) && v >= 0 && v <= 1;
  if (!share(q.freeShare) || !share(q.tightShare) || !finite(q.measuredSec) || !finite(q.nearestOpponentMedianBH)
    || (q.nearestOpponentMedianBH as number) < 0) return 'unsupported_values';
  if ((q.measuredSec as number) < MEASURED_SHARE * (q.end - q.start) - 0.2) return 'not_measurable';
  if (q.kind === 'free' && (q.freeShare as number) < FREE_SHARE) return 'unsupported_values';
  if (q.kind === 'tight' && (q.tightShare as number) < TIGHT_SHARE) return 'unsupported_values';
  if ((q.freeShare as number) + (q.tightShare as number) > 1 + 1e-6) return 'unsupported_values';
  return null;
}

function item(q: WorkerSequence, line: Line, answers: OwnerAnswer[]): Omit<ClipItem, 'text' | 'textSource'> {
  const pattern = q.kind as 'free' | 'tight';
  const share = pattern === 'free' ? (q.freeShare as number) : (q.tightShare as number);
  const assisted = answers.some((a) => a.answer === 'is_me' && a.t >= q.start - TAP_LOOKBACK_SEC && a.t <= q.end);
  // role decides whether the pattern is offered as a strength / improvement; the interpretation stays uncertain
  const kind: ClipItem['kind'] = line === 'attack' || line === 'midfield'
    ? (pattern === 'free' ? 'strength' : 'improve') : 'observation';
  const practice = kind === 'observation' ? null
    : { drillId: pattern === 'free' ? 'show_for_ball' : 'first_touch_away',
        successKey: pattern === 'free' ? 'success.repeat_free_sequence' : 'success.create_space_next_recording' };
  return {
    clip: { start: q.start, end: q.end }, kind, identitySource: assisted ? 'owner_assisted' : 'automatic',
    observation: { pattern, seconds: Math.round((q.end - q.start) * 10) / 10, sharePct: Math.round(share * 100),
      nearestOpponentMedianBH: Math.round((q.nearestOpponentMedianBH as number) * 10) / 10 },
    observationKey: `clip.observation.${pattern}`, interpretationKey: `clip.interpretation.${pattern}.${line}`,
    practice, scope: 'this_clip_only',
    limitations: ['image_plane_distance_not_metres', 'ball_and_teammates_not_assessed', 'one_clip_not_the_match',
      ...(assisted ? ['identity_relies_on_owner_tap'] : [])],
  };
}

export function templateText(it: Omit<ClipItem, 'text' | 'textSource'>): string {
  const o = it.observation;
  const when = `${it.clip.start.toFixed(1)}-${it.clip.end.toFixed(1)} s`;
  const obs = o.pattern === 'free'
    ? `In this clip (${when}, ${o.seconds} s) the nearest opponent was a median ${o.nearestOpponentMedianBH} body heights away in the picture; you were in open space on ${o.sharePct}% of the measured frames.`
    : `In this clip (${when}, ${o.seconds} s) an opponent was close to you: a median ${o.nearestOpponentMedianBH} body heights in the picture, under 1 body height on ${o.sharePct}% of the measured frames.`;
  const interp = o.pattern === 'free'
    ? 'This may mean you made yourself available; the clip cannot show whether a pass was possible.'
    : 'This may mean you were closely marked; the clip cannot show whether you wanted the ball.';
  const act = it.practice
    ? (o.pattern === 'free' ? ' Practice: keep showing in space (show for the ball). Next recording: another 6 s clip in open space on 70% of frames.'
      : ' Practice: move away before receiving (first touch away). Next recording: a 6 s clip where the opponent is more than 1 body height away most of the time.')
    : '';
  return `${obs} ${interp}${act} This is about this clip only.`;
}

const BANNED = /(km|m\/s|metre|meter|mph|speed|sprint|distance covered|team-?mate|wanted to|intended|successful|failed|always|never)/i;

/** A provider may rephrase; it may not add numbers, units or claims the item does not hold. */
export function providerTextSupported(text: string, it: Omit<ClipItem, 'text' | 'textSource'>): boolean {
  if (!text || text.length > 600 || BANNED.test(text)) return false;
  const allowed = new Set([it.clip.start.toFixed(1), it.clip.end.toFixed(1), String(it.observation.seconds),
    String(it.observation.sharePct), String(it.observation.nearestOpponentMedianBH), '1', '6', '70']);
  const nums = text.match(/\d+(?:\.\d+)?/g) ?? [];
  return nums.every((n) => allowed.has(n) || allowed.has(String(Number(n))));
}

export async function buildClipReviewExperimental(args: {
  sequences: WorkerSequence[]; timeline: FrameTimeline; recordingSec: number; line: Line;
  answers?: OwnerAnswer[]; answersFingerprint: string; provider?: Provider;
}): Promise<ClipReview> {
  const answers = args.answers ?? [];
  const seqs = (Array.isArray(args.sequences) ? args.sequences : []).slice(0, 20);
  const review: ClipReview = { experiment: CLIP_REVIEW_EXPERIMENT, basedOn: { answersFingerprint: args.answersFingerprint }, items: [], insufficient: [] };
  for (const q of seqs) {
    const reason = judge(q, seqs, args.timeline, args.recordingSec, answers);
    if (reason) { review.insufficient.push({ clip: { start: q.start, end: q.end }, reason, recovery: RECOVERY[reason] }); continue; }
    const base = item(q, args.line, answers);
    let text = templateText(base);
    let textSource: ClipItem['textSource'] = 'template';
    if (args.provider) {
      try {
        const t = await args.provider(base);
        if (providerTextSupported(t, base)) { text = t; textSource = 'provider'; } else textSource = 'template_after_provider_rejected';
      } catch { textSource = 'template_after_provider_failure'; }
    }
    review.items.push({ ...base, text, textSource });
  }
  return review;
}

/** A review built before the owner's latest identity answers is stale and must not be shown. */
export function isClipReviewStale(review: ClipReview, currentAnswersFingerprint: string): boolean {
  return review.basedOn.answersFingerprint !== currentAnswersFingerprint;
}

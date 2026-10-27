/**
 * Video Intelligence 5.0 - selective, consent-gated video reasoning (layer B, optional).
 *
 * Purpose: explain ONE confirmed clip in football terms when the owner asks ("explain this clip",
 * "what could I have done differently here?"). It never replaces tracking, never produces
 * statistics and never runs on uncertain identity.
 *
 * Every request passes, in order:
 *   1. feature flag VIDEO_REASONING_ENABLED=true (off by default; not a release gate bypass),
 *   2. operator footage approval (AI_FOOTAGE_PROCESSING_APPROVED, existing provider review),
 *   3. the owner's current `ai_analysis` consent and guardian scope (assertAiConsent),
 *   4. the match's current video consent listing the reasoning provider (openrouter_zdr),
 *   5. a CONFIRMED_VISIBLE moment of the current report, clip window <= MAX_CLIP_SEC.
 * Only a few still frames of that clip (target outlined) leave the system, through the existing
 * zero-data-retention OpenRouter route. Output must match a strict schema and is rejected when it
 * cites unknown frames, contains numbers other than the shirt number, or claims goals, assists,
 * distances, speeds, ratings or percentages. Rejected or unavailable -> deterministic fallback.
 */
import type { ChatMessage } from '../ai/providerConfig';
import { cleanModelText, cleanTextList, extractJsonObject, oneOf } from '../ai/outputValidator';
import type { TrackingMoment, TrackingReport } from './trackingV3';

export const REASONING_PROVIDER = 'openrouter_zdr';
export const MAX_CLIP_SEC = 20;
export const MAX_FRAMES = 6;
export const REASONING_KINDS = ['explain', 'alternatives'] as const;
export type ReasoningKind = (typeof REASONING_KINDS)[number];

export type GateInput = {
  env: NodeJS.ProcessEnv;
  footageApproved: boolean;
  aiConsent: boolean;
  videoConsent: { providers: string[]; revokedAt: string | null; current: boolean } | null;
  moment: TrackingMoment | null;
};
export type GateResult = { ok: true } | { ok: false; reason: 'disabled' | 'footage_not_approved' | 'ai_consent_required'
  | 'provider_not_consented' | 'moment_not_confirmed' };

export function reasoningEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VIDEO_REASONING_ENABLED?.trim() === 'true';
}

/** The order matters: the first failing gate is reported (and nothing is sent). */
export function reasoningGate(g: GateInput): GateResult {
  if (!reasoningEnabled(g.env)) return { ok: false, reason: 'disabled' };
  if (!g.footageApproved) return { ok: false, reason: 'footage_not_approved' };
  if (!g.aiConsent) return { ok: false, reason: 'ai_consent_required' };
  const vc = g.videoConsent;
  if (!vc || !vc.current || vc.revokedAt !== null || !vc.providers.includes(REASONING_PROVIDER)) {
    return { ok: false, reason: 'provider_not_consented' };
  }
  if (!g.moment || g.moment.identityState !== 'CONFIRMED_VISIBLE' || g.moment.candidate) return { ok: false, reason: 'moment_not_confirmed' };
  return { ok: true };
}

/** Clip window around the moment's action, never longer than MAX_CLIP_SEC. */
export function clipWindow(m: Pick<TrackingMoment, 'clipStart' | 'clipEnd' | 'start' | 'end'>): { start: number; end: number } {
  const len = m.clipEnd - m.clipStart;
  if (len <= MAX_CLIP_SEC) return { start: m.clipStart, end: m.clipEnd };
  const mid = (m.start + m.end) / 2;
  const start = Math.max(m.clipStart, Math.min(mid - MAX_CLIP_SEC / 2, m.clipEnd - MAX_CLIP_SEC));
  return { start, end: start + MAX_CLIP_SEC };
}

/** Evenly spaced frame times inside the clip (the worker renders them with the target outlined). */
export function frameTimes(clip: { start: number; end: number }, n = MAX_FRAMES): number[] {
  const k = Math.max(1, Math.min(MAX_FRAMES, n));
  const step = (clip.end - clip.start) / k;
  return Array.from({ length: k }, (_, i) => Math.round((clip.start + step * (i + 0.5)) * 10) / 10);
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export type ReasoningContext = {
  number: string | null;
  kit: string;
  position: string;
  kind: ReasoningKind;
  clip: { start: number; end: number };
  frames: Array<{ id: string; t: number }>;
  /** layer-A facts the model may rely on (already validated) */
  facts: string[];
};

/** Facts from the report that hold for this clip (identity and measured off-ball sequence only). */
export function clipFacts(report: TrackingReport, moment: TrackingMoment, clip: { start: number; end: number }): string[] {
  const facts = [`The outlined player is the selected player${report.target.number ? ` (#${report.target.number})` : ''}; identity is confirmed in this clip.`];
  if (moment.evidence === 'number_read') facts.push('The shirt number was read in this clip.');
  for (const q of report.offball?.sequences ?? []) {
    if (q.start < clip.end && q.end > clip.start && (q.kind === 'free' || q.kind === 'tight')) {
      facts.push(q.kind === 'free' ? 'Measured: no opponent was close to the player for most of this sequence (image-plane, not metres).'
        : 'Measured: an opponent was within about one body height of the player for most of this sequence (image-plane, not metres).');
    }
  }
  facts.push('The ball and pitch markings are not tracked reliably in this recording; do not assume where the ball went.');
  return facts;
}

export function buildReasoningMessages(ctx: ReasoningContext, frameImages: string[]): ChatMessage[] {
  const system = [
    'You are a careful football (soccer) video analyst helping a player review ONE short clip of their own match.',
    'You see a few still frames in time order. The selected player is outlined with a yellow box.',
    'Describe only what is visible in the frames. Separate observation (what is visible) from interpretation (football meaning, uncertain).',
    'Never state numbers: no statistics, distances, speeds, percentages, ratings, scores or counts. Do not name other players or their shirt numbers.',
    'Never claim goals, assists, shots on target or pass outcomes unless clearly visible; if the ball is not visible say so.',
    'If the frames do not show enough, set confidence to "unclear" and explain the limitation.',
    'Answer as JSON only: {"observation": string, "interpretation": string, "evidenceFrames": string[], "confidence": "clear"|"partial"|"unclear", "limitations": string[], "suggestion": string}.',
    'evidenceFrames lists frame ids (e.g. "f2") that show the observation. Keep each text under 300 characters.',
  ].join('\n');
  const task = ctx.kind === 'alternatives'
    ? 'Question: what could the outlined player have done differently in this situation? Give at most one realistic option, as an interpretation.'
    : 'Question: explain what the outlined player is doing in this situation and why it may matter.';
  const meta = [
    `Player position (as entered by the player): ${ctx.position || 'unknown'}. Team kit: ${ctx.kit || 'unknown'}.`,
    `Clip: ${clock(ctx.clip.start)}-${clock(ctx.clip.end)}. Frames: ${ctx.frames.map((f) => `${f.id}@${clock(f.t)}`).join(', ')}.`,
    'Known facts (trusted):', ...ctx.facts.map((f) => `- ${f}`),
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: [{ type: 'text', text: `${meta}\n${task}` },
      ...frameImages.map((b64) => ({ type: 'image_url' as const, image_url: { url: `data:image/jpeg;base64,${b64}` } }))] },
  ];
}

export type ReasonedAnswer = {
  observation: string;
  interpretation: string;
  evidence: Array<{ frameId: string; t: number }>;
  confidence: 'clear' | 'partial' | 'unclear';
  limitations: string[];
  suggestion: string;
};

const FORBIDDEN_CLAIMS = /(\bgoals?\b|\bscor(e|ed|es|ing)\b|\bassists?\b|\bxg\b|\bkm\b|kilomet|\bmetres?\b|\bmeters?\b|\bmph\b|km\/h|\bpercent|%|\brating\b|out of (ten|10)|\bstatistic)/i;

/** Digits allowed in output: the target's own number and the frame clock strings. */
function numbersOk(text: string, allowed: Set<string>): boolean {
  const withoutClocks = text.replace(/\b\d{1,2}:\d{2}\b/g, (m) => (allowed.has(m) ? '' : m)).replace(/\bf\d\b/g, '');
  const nums = withoutClocks.match(/\d+/g) ?? [];
  return nums.every((n) => allowed.has(n));
}

export type ValidationResult = { ok: true; answer: ReasonedAnswer } | { ok: false; reason: string };

export function validateReasoning(raw: string, ctx: ReasoningContext): ValidationResult {
  let obj: Record<string, unknown>;
  try {
    obj = extractJsonObject(raw);
  } catch {
    return { ok: false, reason: 'not_json' };
  }
  const observation = cleanModelText(obj.observation, 400);
  const interpretation = cleanModelText(obj.interpretation, 400);
  const suggestion = cleanModelText(obj.suggestion, 300);
  const limitations = cleanTextList(obj.limitations, 3, 200);
  if (!observation) return { ok: false, reason: 'empty_observation' };
  const known = new Map(ctx.frames.map((f) => [f.id, f.t]));
  const evidence = (Array.isArray(obj.evidenceFrames) ? obj.evidenceFrames : [])
    .filter((id): id is string => typeof id === 'string' && known.has(id))
    .slice(0, MAX_FRAMES).map((id) => ({ frameId: id, t: known.get(id) as number }));
  if (Array.isArray(obj.evidenceFrames) && obj.evidenceFrames.length > 0 && evidence.length < obj.evidenceFrames.length) {
    return { ok: false, reason: 'unknown_frame' };
  }
  let confidence = oneOf(obj.confidence, ['clear', 'partial', 'unclear'] as const, 'unclear');
  if (evidence.length === 0) confidence = 'unclear';
  const allowed = new Set<string>([...(ctx.number ? [ctx.number] : []), ...ctx.frames.map((f) => clock(f.t)),
    clock(ctx.clip.start), clock(ctx.clip.end)]);
  for (const text of [observation, interpretation, suggestion, ...limitations]) {
    if (FORBIDDEN_CLAIMS.test(text)) return { ok: false, reason: 'unsupported_claim' };
    if (!numbersOk(text, allowed)) return { ok: false, reason: 'unsupported_number' };
  }
  return { ok: true, answer: { observation, interpretation, evidence, confidence, limitations, suggestion } };
}

/** Cache: one answer per (report version, moment, kind) - repeated questions cost nothing. */
export function reasoningCacheId(reportVersion: number, momentId: string, kind: ReasoningKind): string {
  return `r_${reportVersion}_${momentId.replace(/[^A-Za-z0-9_-]/g, '_')}_${kind}`.slice(0, 120);
}

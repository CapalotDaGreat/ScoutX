/**
 * My Moments: presentation model for the target's clip windows. Every card states how strong its
 * evidence is, and uncertain material is kept apart from confirmed moments.
 */
import type { TrackingMoment, TrackingReport } from '@/features/match-analysis/services/trackingPresentation';

export type MomentCategory = 'on_ball' | 'passing' | 'duels' | 'on_camera';
export type EvidenceLabel = 'confirmed' | 'estimated' | 'needs_review' | 'not_measurable';

export type MomentCard = {
  id: string;
  category: MomentCategory;
  /** i18n key suffix for the title, e.g. 'pass_attempt' */
  titleKey: TrackingMoment['kind'];
  evidence: EvidenceLabel;
  /** The owner can answer "Is this you?" on this moment. */
  askIdentity: boolean;
  clipStart: number;
  clipEnd: number;
  actionAt: number;
  durationSec: number;
  outcome: 'completed' | 'incomplete' | 'unknown' | null;
  imagePath: string | null;
  indicator: TrackingMoment['indicator'];
  /** deterministic ordering score: evidence strength first, then informativeness */
  rank: number;
};

const CATEGORY: Record<TrackingMoment['kind'], MomentCategory> = {
  contact: 'on_ball', carry: 'on_ball', pass_attempt: 'passing', duel_candidate: 'duels', tackle_candidate: 'duels', spell: 'on_camera',
};
const KIND_WEIGHT: Record<TrackingMoment['kind'], number> = {
  pass_attempt: 5, carry: 4, contact: 3, tackle_candidate: 2, duel_candidate: 2, spell: 1,
};

/**
 * Evidence label:
 *   confirmed     - identity confirmed on video and a measured action (or confirmed spell)
 *   estimated     - identity likely (not confirmed) but the action itself was measured
 *   needs_review  - duel/tackle candidates and likely-only spells: the owner should check
 */
export function evidenceOf(m: TrackingMoment): EvidenceLabel {
  if (m.candidate) return 'needs_review';
  if (m.identityState === 'CONFIRMED_VISIBLE') return 'confirmed';
  return m.kind === 'spell' ? 'needs_review' : 'estimated';
}

export function toMomentCard(m: TrackingMoment): MomentCard {
  const evidence = evidenceOf(m);
  const evidenceWeight = evidence === 'confirmed' ? 100 : evidence === 'estimated' ? 50 : 0;
  const outcomeWeight = m.outcome === 'completed' ? 1 : 0;
  return {
    id: m.id,
    category: CATEGORY[m.kind],
    titleKey: m.kind,
    evidence,
    askIdentity: m.identityState === 'LIKELY_VISIBLE' && m.indicator.length > 0,
    clipStart: m.clipStart,
    clipEnd: m.clipEnd,
    actionAt: m.start,
    durationSec: Math.max(0, m.clipEnd - m.clipStart),
    outcome: m.kind === 'pass_attempt' ? (m.outcome ?? 'unknown') : null,
    imagePath: m.imagePath ?? null,
    indicator: m.indicator,
    rank: evidenceWeight + KIND_WEIGHT[m.kind] * 10 + outcomeWeight + Math.min(9, m.end - m.start) / 10,
  };
}

export type MomentsView = {
  /** confirmed and estimated moments, in match order */
  moments: MomentCard[];
  /** moments that need the owner's eyes (kept apart) */
  needsReview: MomentCard[];
  categories: Array<{ id: MomentCategory; count: number }>;
};

export function buildMomentsView(report: TrackingReport | null, filter: MomentCategory | 'all' = 'all'): MomentsView {
  const cards = (report?.moments ?? []).map(toMomentCard);
  const counts = new Map<MomentCategory, number>();
  for (const c of cards) if (c.evidence !== 'needs_review') counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
  const keep = (c: MomentCard) => filter === 'all' || c.category === filter;
  return {
    moments: cards.filter((c) => c.evidence !== 'needs_review' && keep(c)).sort((a, b) => a.clipStart - b.clipStart),
    needsReview: cards.filter((c) => c.evidence === 'needs_review').sort((a, b) => a.clipStart - b.clipStart),
    categories: (['on_ball', 'passing', 'duels', 'on_camera'] as const).filter((id) => (counts.get(id) ?? 0) > 0)
      .map((id) => ({ id, count: counts.get(id) ?? 0 })),
  };
}

/** Target indicator box at playback time t (linear interpolation, hidden in gaps > 1.5 s). */
export function indicatorAt(indicator: TrackingMoment['indicator'], t: number): { x: number; y: number; w: number; h: number } | null {
  if (indicator.length === 0) return null;
  let i = 0;
  while (i < indicator.length && indicator[i][0] < t) i += 1;
  const after = indicator[Math.min(i, indicator.length - 1)];
  const before = indicator[Math.max(0, i - 1)];
  if (Math.min(Math.abs(after[0] - t), Math.abs(before[0] - t)) > 1.5) return null;
  if (before === after || after[0] === before[0]) return { x: before[1], y: before[2], w: before[3], h: before[4] };
  const a = (t - before[0]) / (after[0] - before[0]);
  if (a < 0 || a > 1) return { x: after[1], y: after[2], w: after[3], h: after[4] };
  const lerp = (k: number) => before[k] + a * (after[k] - before[k]);
  return { x: lerp(1), y: lerp(2), w: lerp(3), h: lerp(4) };
}

/** Player-adjustable clip window, clamped to the recording and to a 3-30 s length. */
export function adjustClip(card: Pick<MomentCard, 'clipStart' | 'clipEnd'>, deltaStart: number, deltaEnd: number,
  recordingSec: number): { clipStart: number; clipEnd: number } {
  const start = Math.max(0, card.clipStart + deltaStart);
  let end = Math.min(recordingSec > 0 ? recordingSec : Number.POSITIVE_INFINITY, card.clipEnd + deltaEnd);
  if (end - start < 3) end = start + 3;
  if (end - start > 30) end = start + 30;
  return { clipStart: Math.round(start * 10) / 10, clipEnd: Math.round(end * 10) / 10 };
}

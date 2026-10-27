/**
 * AI Coach (layer C) - evidence-grounded, deterministic. Every insight is derived from a layer-A
 * measurement that exists in the validated tracking report and carries:
 *   what happened / why it matters / what to do differently / how to practise / where to see it.
 * No measurement -> no insight. Numbers are only ever copied from the report, never generated.
 * Limitations are stated in the first person ("I cannot verify ..."), not hidden.
 */
import type { TrackingReport } from '@/features/match-analysis/services/trackingPresentation';
import { buildMomentsView, type EvidenceLabel, type MomentCard } from './moments';

export type CoachTopic = 'involvement' | 'carrying' | 'passing' | 'passing_accuracy' | 'identity' | 'ball_visibility' | 'physical' | 'positioning';
export type PositionGroup = 'goalkeeper' | 'defender' | 'midfielder' | 'winger' | 'forward' | 'unknown';
/** 5.0: the eight roles the coach adapts its explanations to (drills still use the broader group). */
export type PositionRole = 'goalkeeper' | 'centre_back' | 'full_back' | 'defensive_mid' | 'central_mid' | 'attacking_mid'
  | 'winger' | 'striker' | 'unknown';
/**
 * Evidence tiers (5.0):
 *  1 strong   - confirmed identity and a clear measurement: specific coaching allowed
 *  2 partial  - likely identity or incomplete action: qualified wording, never a verified statistic
 *  3 context  - general match context without confirmed involvement: kept apart from personal analysis
 *  4 none     - insufficient evidence: the limitation and a practical next step
 */
export type EvidenceTier = 1 | 2 | 3 | 4;
export type AgeBand = 'youth' | 'adult';

export type Drill = { id: string; topics: CoachTopic[]; positions: PositionGroup[] | 'all'; minutes: number; youth: boolean };

/** Small, position-aware drill library. Text lives in i18n under review.drill.<id>.{name,how}. */
export const DRILLS: Drill[] = [
  { id: 'scan_before_receive', topics: ['passing_accuracy', 'passing'], positions: 'all', minutes: 10, youth: true },
  { id: 'rondo_4v2', topics: ['passing_accuracy', 'involvement'], positions: ['defender', 'midfielder', 'winger'], minutes: 15, youth: true },
  { id: 'wall_pass_weight', topics: ['passing', 'passing_accuracy'], positions: 'all', minutes: 10, youth: true },
  { id: 'carry_into_space', topics: ['carrying'], positions: ['midfielder', 'winger', 'forward', 'defender'], minutes: 12, youth: true },
  { id: 'show_for_ball', topics: ['involvement'], positions: ['midfielder', 'winger', 'forward'], minutes: 12, youth: true },
  { id: 'width_and_depth', topics: ['involvement'], positions: ['winger'], minutes: 15, youth: false },
  { id: 'build_up_angles', topics: ['involvement', 'passing'], positions: ['defender', 'goalkeeper'], minutes: 15, youth: false },
  { id: 'first_touch_away', topics: ['carrying', 'passing_accuracy'], positions: 'all', minutes: 10, youth: true },
  { id: 'distribution_targets', topics: ['passing', 'passing_accuracy'], positions: ['goalkeeper'], minutes: 12, youth: true },
  { id: 'show_for_ball', topics: ['positioning'], positions: ['midfielder', 'winger', 'forward'], minutes: 12, youth: true },
  { id: 'build_up_angles', topics: ['positioning'], positions: ['defender', 'goalkeeper'], minutes: 15, youth: false },
];

export type Insight = {
  id: string;
  /**
   * observation: directly measured behaviour (4.1 off-ball) with a separate, explicitly
   * uncertain interpretation - never presented as a strength or weakness.
   */
  kind: 'strength' | 'improve' | 'limitation' | 'observation';
  topic: CoachTopic;
  evidence: EvidenceLabel;
  /** i18n keys under review.coach.<topic>.<kind>.*; params are measured values only */
  params: Record<string, number>;
  drill: Drill | null;
  /** where to see it */
  momentIds: string[];
  /** watchable time ranges that are not moments (e.g. off-ball episodes) */
  clips?: Array<{ start: number; end: number }>;
  tier: EvidenceTier;
  /** i18n base overriding review.coach.<topic>.<kind> (5.0 sequence observations) */
  textKey?: string;
  /** role-specific "why it matters" key */
  whyKey?: string;
};

export function positionRole(position: string | null | undefined): PositionRole {
  const p = ` ${(position ?? '').toLowerCase().replace(/[-_]/g, ' ')} `;
  if (/(goal|keeper|\bgk\b|torwart|portero|gardien|portiere|guarda.?redes|doelman|goleiro)/.test(p)) return 'goalkeeper';
  if (/(full ?back|wing ?back|\b[lr]w?b\b|außenverteidiger|aussenverteidiger|lateral|arrière latéral|terzino|vleugelverdediger|back (left|right)|(left|right) back)/.test(p)) return 'full_back';
  if (/(cent(re|er) ?back|\bcb\b|central defender|innenverteidiger|defensa central|défenseur central|difensore centrale|centrale verdediger|zagueiro|stopper|libero|sweeper)/.test(p)) return 'centre_back';
  if (/(defensive mid|\bcdm\b|\bdm\b|holding|sechser|\b6\b|pivote|mediocentro defensivo|milieu défensif|mediano|volante|controleur)/.test(p)) return 'defensive_mid';
  if (/(attacking mid|\bcam\b|\bam\b|zehner|\b10\b|offensives mittelfeld|mediapunta|meneur|trequartista|aanvallende middenvelder|meia.?atacante|playmaker)/.test(p)) return 'attacking_mid';
  if (/(wing|flügel|fluegel|ailier|extremo|\bala\b|esterno|vleugel|ponta|\b[lr]m\b|\b[lr]w\b)/.test(p)) return 'winger';
  if (/(striker|forward|\bst\b|\bcf\b|stürm|sturm|attaquant|delantero|attacc|aanvall|spits|centroavante|\b9\b)/.test(p)) return 'striker';
  if (/(mid|\bcm\b|mittelf|milieu|centrocamp|medio|meio|middenveld|\b8\b)/.test(p)) return 'central_mid';
  if (/(back|defen|verteid|défens|defens|difens|verdedig)/.test(p)) return 'centre_back';
  return 'unknown';
}

/** role -> drill group */
export function groupOfRole(role: PositionRole): PositionGroup {
  switch (role) {
    case 'goalkeeper': return 'goalkeeper';
    case 'centre_back': case 'full_back': return 'defender';
    case 'defensive_mid': case 'central_mid': case 'attacking_mid': return 'midfielder';
    case 'winger': return 'winger';
    case 'striker': return 'forward';
    default: return 'unknown';
  }
}

/** coarse line used for role-specific explanations */
export function lineOfRole(role: PositionRole): 'defence' | 'midfield' | 'attack' | 'general' {
  if (role === 'goalkeeper' || role === 'centre_back' || role === 'full_back' || role === 'defensive_mid') return 'defence';
  if (role === 'central_mid') return 'midfield';
  if (role === 'attacking_mid' || role === 'winger' || role === 'striker') return 'attack';
  return 'general';
}

export function positionGroup(position: string | null | undefined): PositionGroup {
  const r = positionRole(position);
  if (r !== 'unknown') return groupOfRole(r);
  const p = (position ?? '').toLowerCase();
  if (/(goal|keeper|gk|torwart|portero|gardien|portiere|keeper|guarda)/.test(p)) return 'goalkeeper';
  if (/(wing|flügel|fluegel|ailier|extremo|ala|esterno|vleugel|ponta)/.test(p)) return 'winger';
  if (/(back|defen|cb|lb|rb|verteid|défens|defens|difens|verdedig|zagueiro|lateral)/.test(p)) return 'defender';
  if (/(mid|cm|dm|am|mittelf|milieu|centrocamp|medio|meio)/.test(p)) return 'midfielder';
  if (/(forward|striker|st\b|cf|stürm|sturm|attaquant|delantero|attacc|aanvall|spits|atacante)/.test(p)) return 'forward';
  return 'unknown';
}

export function pickDrill(topic: CoachTopic, position: PositionGroup, age: AgeBand): Drill | null {
  const fits = DRILLS.filter((d) => d.topics.includes(topic) && (age === 'adult' || d.youth));
  return fits.find((d) => d.positions !== 'all' && d.positions.includes(position)) ?? fits.find((d) => d.positions === 'all') ?? null;
}

const MIN_CONFIRMED_FOR_COACHING_SEC = 120;

function ids(cards: MomentCard[], pred: (c: MomentCard) => boolean, max = 5): string[] {
  return cards.filter(pred).sort((a, b) => b.rank - a.rank).slice(0, max).map((c) => c.id);
}

/**
 * At most three strengths and three improvements (quality over quantity), plus the limitations that
 * explain what could not be assessed from this recording.
 */
export function buildCoachInsights(report: TrackingReport | null, profile: { position?: string | null; ageBand?: AgeBand } = {}): Insight[] {
  if (!report) return [];
  const role = positionRole(profile.position ?? report.target.position);
  const position = role !== 'unknown' ? groupOfRole(role) : positionGroup(profile.position ?? report.target.position);
  const age = profile.ageBand ?? 'adult';
  const view = buildMomentsView(report);
  const cards = view.moments; // confirmed + estimated only
  const c = report.coverage;
  const out: Insight[] = [];
  const confirmedOnBall = cards.filter((m) => m.evidence === 'confirmed' && (m.category === 'on_ball' || m.category === 'passing'));
  const completed = cards.filter((m) => m.titleKey === 'pass_attempt' && m.outcome === 'completed');
  const incomplete = cards.filter((m) => m.titleKey === 'pass_attempt' && m.outcome === 'incomplete');
  const carries = cards.filter((m) => m.titleKey === 'carry');

  if (confirmedOnBall.length >= 3) {
    out.push({ id: 'involvement_strength', kind: 'strength', topic: 'involvement', evidence: 'confirmed',
      params: { count: confirmedOnBall.length }, drill: null, momentIds: ids(confirmedOnBall, () => true), tier: 1 });
  }
  if (completed.length >= 2) {
    out.push({ id: 'passing_strength', kind: 'strength', topic: 'passing', evidence: 'confirmed',
      params: { count: completed.length }, drill: null, momentIds: ids(completed, () => true), tier: 1 });
  }
  if (carries.length >= 2 && out.length < 2) {
    const allConfirmed = carries.every((m) => m.evidence === 'confirmed');
    out.push({ id: 'carrying_strength', kind: 'strength', topic: 'carrying', evidence: allConfirmed ? 'confirmed' : 'estimated',
      params: { count: carries.length }, drill: null, momentIds: ids(carries, () => true), tier: allConfirmed ? 1 : 2 });
  }
  if (incomplete.length >= 2) {
    out.push({ id: 'passing_improve', kind: 'improve', topic: 'passing_accuracy', evidence: 'confirmed',
      params: { count: incomplete.length, completed: completed.length }, drill: pickDrill('passing_accuracy', position, age),
      momentIds: ids(incomplete, () => true), tier: 1 });
  }
  if (c.confirmedVisibleSec >= MIN_CONFIRMED_FOR_COACHING_SEC && confirmedOnBall.length < 2) {
    // Seen for long stretches but rarely on the ball: an involvement opportunity - only when the
    // ball was actually trackable in this recording (otherwise it is a limitation, see below).
    if (report.ball.contacts > 0) {
      out.push({ id: 'involvement_improve', kind: 'improve', topic: 'involvement', evidence: 'estimated',
        params: { minutes: Math.round(c.confirmedVisibleSec / 60), count: confirmedOnBall.length },
        drill: pickDrill('involvement', position, age), momentIds: ids(cards, (m) => m.category === 'on_camera', 3), tier: 2 });
    }
  }

  // Off-ball (4.1): measured on confirmed frames only; reported as an observation with a separate,
  // uncertain interpretation. Too little confirmed footage -> an explicit limitation instead.
  const ob = report.offball;
  if (ob?.status === 'measured' && ob.nearestOpponentBodyHeights) {
    const episodes = [...(ob.freeEpisodes ?? []), ...(ob.tightEpisodes ?? [])].sort((a, b) => a.start - b.start).slice(0, 4);
    out.push({ id: 'positioning_observation', kind: 'observation', topic: 'positioning', evidence: 'confirmed',
      params: { freePct: Math.round((ob.freeShare ?? 0) * 100), tightPct: Math.round((ob.tightShare ?? 0) * 100),
        median: ob.nearestOpponentBodyHeights.median, measuredMin: Math.round((ob.measuredSec ?? 0) / 6) / 10 },
      drill: pickDrill('positioning', position, age), momentIds: [], clips: episodes, tier: 1 });
  } else if (ob?.status === 'insufficient') {
    out.push({ id: 'positioning_limit', kind: 'limitation', topic: 'positioning', evidence: 'not_measurable',
      params: { confirmedSec: Math.round(ob.confirmedSec), minSec: Math.round(ob.minConfirmedSec) }, drill: null, momentIds: [], tier: 4,
      textKey: (ob.sequences ?? []).some((q) => q.kind === 'free' || q.kind === 'tight') ? 'review.coach.positioning.limitationClips' : undefined });
  }
  // 5.0 evidence-specific sufficiency: one continuous confirmed sequence (>= 6 s, server-checked)
  // supports a narrow observation about that clip only - never about the whole match.
  const line = lineOfRole(role);
  const seqs = (ob?.sequences ?? []).filter((q) => q.kind === 'free' || q.kind === 'tight')
    .sort((a, b) => (b.measuredSec ?? 0) - (a.measuredSec ?? 0)).slice(0, 2);
  for (const q of seqs) {
    const share = q.kind === 'free' ? q.freeShare ?? 0 : q.tightShare ?? 0;
    out.push({ id: `sequence_${q.kind}_${Math.round(q.start)}`, kind: 'observation', topic: 'positioning', evidence: 'confirmed',
      params: { seconds: Math.round(q.end - q.start), pct: Math.round(share * 100), median: q.nearestOpponentMedianBH ?? 0 },
      drill: pickDrill('positioning', position, age), momentIds: [], clips: [{ start: q.start, end: q.end }], tier: 1,
      textKey: `review.coach.sequence.${q.kind}`, whyKey: `review.coach.sequence.${q.kind}.why_${line}` });
  }

  // Limitations: what I could not verify, and why.
  const analysed = c.analysedSec;
  if (analysed > 0 && c.confirmedVisibleSec / analysed < 0.1) {
    out.push({ id: 'identity_limit', kind: 'limitation', topic: 'identity', evidence: 'not_measurable',
      params: { confirmedMin: Math.round(c.confirmedVisibleSec / 6) / 10, analysedMin: Math.round(analysed / 60),
        review: view.needsReview.length }, drill: null, momentIds: [], tier: 4 });
  }
  if (report.ball.contacts === 0 && report.events.length === 0) {
    out.push({ id: 'ball_limit', kind: 'limitation', topic: 'ball_visibility', evidence: 'not_measurable', params: {},
      drill: null, momentIds: [], tier: 4 });
  }
  if (!(report.physical.status === 'calibrated' && report.physical.productionVisible)) {
    out.push({ id: 'physical_limit', kind: 'limitation', topic: 'physical', evidence: 'not_measurable', params: {},
      drill: null, momentIds: [], tier: 4 });
  }
  // up to three of each - only as many as the evidence supports
  const strengths = out.filter((i) => i.kind === 'strength').slice(0, 3);
  const improve = out.filter((i) => i.kind === 'improve').slice(0, 3);
  return [...strengths, ...improve, ...out.filter((i) => i.kind === 'observation'), ...out.filter((i) => i.kind === 'limitation')];
}

export type RecordingTip = 'wider_view' | 'follow_play' | 'bold_numbers' | 'record_whole_match' | 'steady_camera';

/** Evidence-based recording advice: each tip is triggered by a measured coverage gap. */
export function recordingTips(report: TrackingReport | null): RecordingTip[] {
  if (!report) return [];
  const c = report.coverage;
  const tips: RecordingTip[] = [];
  if (c.matchSec > 0 && c.unobservedSec / c.matchSec > 0.15) tips.push('follow_play');
  if (c.analysedSec > 0 && c.ambiguousSec / c.analysedSec > 0.3) tips.push('bold_numbers');
  if (c.analysedSec > 0 && c.notIdentifiedSec / c.analysedSec > 0.4) tips.push('wider_view');
  if (report.ball.contacts === 0) tips.push('steady_camera');
  return tips.slice(0, 2);
}

export type NextMatchFocus =
  | { kind: 'skill'; insightId: string; topic: CoachTopic; drill: Drill | null; matchesGoalId: string | null }
  | { kind: 'recording'; tip: RecordingTip }
  | null;

/**
 * One thing to take into the next match: the top improvement (aligned with an existing
 * development goal if one shares its topic), otherwise the most useful recording tip.
 */
export function nextMatchFocus(insights: Insight[], tips: RecordingTip[], goals: Array<{ id: string; title: string; category?: string }> = []): NextMatchFocus {
  const improve = insights.find((i) => i.kind === 'improve');
  if (improve) {
    const words: Record<CoachTopic, RegExp> = {
      passing: /pass/i, passing_accuracy: /pass/i, carrying: /(carry|dribbl|drib)/i, involvement: /(involv|touch|ball)/i,
      identity: /$^/, ball_visibility: /$^/, physical: /(sprint|speed|fit)/i, positioning: /(position|space|move)/i,
    };
    const goal = goals.find((g) => words[improve.topic].test(g.title));
    return { kind: 'skill', insightId: improve.id, topic: improve.topic, drill: improve.drill, matchesGoalId: goal?.id ?? null };
  }
  return tips.length > 0 ? { kind: 'recording', tip: tips[0] } : null;
}

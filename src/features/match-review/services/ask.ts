/**
 * Ask PitchProof - retrieval over this match's validated evidence (moments, coverage, coach
 * insights). Deterministic: intent detection + retrieval + templated answers with timestamps.
 * No external model is called and no number is produced that the report does not contain.
 * Questions about things this recording cannot support (distance, speed, goals ...) get an
 * explicit "I cannot verify ..." answer with the reason, never an estimate.
 */
import type { TrackingReport } from '@/features/match-analysis/services/trackingPresentation';
import { buildCoachInsights, type Insight } from './coach';
import { buildMomentsView, type MomentCard } from './moments';

export type AskIntent =
  | 'best_moment' | 'moments' | 'passing' | 'distance' | 'speed' | 'heatmap' | 'goals' | 'improve' | 'well'
  | 'identity' | 'review' | 'compare' | 'space' | 'at_time' | 'unknown';

/** Multilingual keyword cues (en, de, es, fr, it, nl, pt). Order matters: first match wins. */
const CUES: Array<[AskIntent, RegExp]> = [
  ['space', /(free|space|unmarked|marked|marking|off the ball|without the ball|frei|raum|deckung|ohne ball|espacio|libre|marcad|sin bal[oó]n|espace|libre|marquage|sans ballon|spazio|smarc|marcat|senza palla|ruimte|vrij|gedekt|zonder bal|espa[cç]o|marca[cç][aã]o|sem bola)/i],
  ['distance', /(\bkm\b|kilomet|distance|distanz|strecke|distancia|distanza|afstand|dist[aâ]ncia|how far|wie weit|run\b|ran\b|gelaufen|corr[ií]|couru|percors|gelopen)/i],
  ['speed', /(speed|sprint|fast|quick|tempo|geschwind|schnell|velocidad|r[aá]pid|vitesse|velocit|snelheid|snel|velocidade)/i],
  ['heatmap', /(heat ?map|heatmap|position(ing)?|where was i|wo war ich|d[oó]nde estaba|o[uù] [ée]tais|dove ero|waar was ik|onde eu estava|mapa de calor|carte de chaleur|mappa di calore)/i],
  ['goals', /(goal|scor(e|ed)|assist|shot|\btore?\b|schuss|\bgol(es)?\b|\btiros?\b|marqu[ée]|doelpunt|schot|chute)/i],
  ['compare', /(compare|last match|previous|vergleich|letzte[sn]? spiel|compar|dernier match|partita precedente|vorige wedstrijd|jogo anterior|improv(ing|ed) over)/i],
  ['improve', /(improve|better|work on|verbesser|besser|mejorar|am[eé]liorer|migliorar|verbeteren|melhorar|weakness|schw[aä]che)/i],
  ['passing', /(pass|zuspiel|pase|passe|passaggi|passaggio|passes)/i],
  ['well', /(well|good|strength|stärke|gut gemacht|bien|bueno|fuerte|bon\b|forces?|bene|punti di forza|goed|sterk|bem\b|pontos fortes)/i],
  ['best_moment', /(best|highlight|top moment|bester?|beste|mejor|meilleur|migliore|melhor)/i],
  ['identity', /(sure|confident|was (it|that) me|find me|sicher|erkannt|seguro|s[uû]r|sicuro|zeker|certeza|identif)/i],
  ['review', /(review|check|confirm|überprüf|pr[uü]f|revisar|v[ée]rifier|controll|controleren|verificar)/i],
  ['moments', /(moment|touch|ball|when|wann|cu[aá]ndo|quand|quando|wanneer|szene|clip|jugada|action|aktion|azione|actie|a[cç][aã]o)/i],
];

/** "What happened at 32:30?" -> 1950 s. Accepts m:ss and mm:ss (also h:mm:ss). */
export function parseTimestamp(question: string): number | null {
  const m = /\b(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)\b/.exec(question);
  if (!m) return null;
  return (m[1] ? Number(m[1]) * 3600 : 0) + Number(m[2]) * 60 + Number(m[3]);
}

export function detectIntent(question: string): AskIntent {
  const q = question.trim();
  if (!q) return 'unknown';
  if (parseTimestamp(q) !== null) return 'at_time';
  for (const [intent, re] of CUES) if (re.test(q)) return intent;
  return 'unknown';
}

export type AskAnswer = {
  intent: AskIntent;
  kind: 'answer' | 'cannot_verify' | 'not_enough_evidence';
  /** i18n key under review.ask.answer.* and its measured params */
  key: string;
  params: Record<string, number | string>;
  moments: MomentCard[];
  insight: Insight | null;
  followUps: AskIntent[];
};

const FOLLOW_UPS: Record<AskIntent, AskIntent[]> = {
  best_moment: ['moments', 'improve'], moments: ['best_moment', 'review'], passing: ['improve', 'moments'],
  distance: ['identity', 'moments'], speed: ['identity', 'moments'], heatmap: ['moments', 'identity'],
  goals: ['moments', 'best_moment'], improve: ['well', 'moments'], well: ['improve', 'best_moment'],
  identity: ['review', 'moments'], review: ['moments', 'identity'], compare: ['improve', 'well'], unknown: ['best_moment', 'improve'],
  space: ['moments', 'identity'], at_time: ['moments', 'best_moment'],
};

export function answerQuestion(question: string, report: TrackingReport | null, profile: { position?: string | null } = {}): AskAnswer {
  const intent = detectIntent(question);
  const base = { intent, moments: [] as MomentCard[], insight: null as Insight | null, followUps: FOLLOW_UPS[intent], params: {} };
  if (!report) return { ...base, kind: 'not_enough_evidence', key: 'noReport' };
  const view = buildMomentsView(report);
  const ranked = [...view.moments].sort((a, b) => b.rank - a.rank);
  const insights = buildCoachInsights(report, profile);
  const c = report.coverage;
  switch (intent) {
    case 'at_time': {
      // Clip retrieval by time: moments near the asked time (incl. ones to check), nearest first.
      const at = parseTimestamp(question) ?? 0;
      const all = [...view.moments, ...view.needsReview];
      const near = all.filter((m) => m.clipEnd >= at - 30 && m.clipStart <= at + 30)
        .sort((a, b) => Math.abs(a.actionAt - at) - Math.abs(b.actionAt - at)).slice(0, 4);
      if (near.length > 0) {
        const confirmed = near.some((m) => m.evidence === 'confirmed');
        return { ...base, kind: 'answer', key: confirmed ? 'atTime' : 'atTimeUnsure', moments: near,
          params: { time: clock(at), count: near.length } };
      }
      const nearest = [...all].sort((a, b) => Math.abs(a.actionAt - at) - Math.abs(b.actionAt - at)).slice(0, 1);
      return { ...base, kind: 'not_enough_evidence', key: 'atTimeNone', moments: nearest, params: { time: clock(at) } };
    }
    case 'space': {
      const obs = insights.find((x) => x.kind === 'observation' && x.topic === 'positioning');
      if (obs) return { ...base, kind: 'answer', key: 'space', insight: obs, params: obs.params };
      const lim = insights.find((x) => x.topic === 'positioning');
      return lim ? { ...base, kind: 'not_enough_evidence', key: 'spaceInsufficient', params: lim.params }
        : { ...base, kind: 'cannot_verify', key: 'spaceUnavailable' };
    }
    case 'distance':
    case 'speed': {
      const calibrated = report.physical.status === 'calibrated' && report.physical.productionVisible;
      if (!calibrated) return { ...base, kind: 'cannot_verify', key: intent === 'distance' ? 'distanceUncalibrated' : 'speedUncalibrated' };
      const key = intent === 'distance' ? 'distanceObserved' : 'peakSpeed';
      const metric = report.physical.values[key];
      if (!metric || metric.value === null) return { ...base, kind: 'cannot_verify', key: 'physicalMissing' };
      return { ...base, kind: 'answer', key: intent === 'distance' ? 'distance' : 'speed', params: { value: metric.value, unit: metric.unit } };
    }
    case 'heatmap':
      return report.heatmap.status === 'observed_only'
        ? { ...base, kind: 'answer', key: 'heatmapObserved' }
        : { ...base, kind: 'cannot_verify', key: 'heatmapUnavailable' };
    case 'goals':
      return { ...base, kind: 'cannot_verify', key: 'goalsNotMeasured', moments: ranked.slice(0, 3) };
    case 'compare':
      return { ...base, kind: 'not_enough_evidence', key: 'compareSeeDevelopment' };
    case 'passing': {
      const passes = view.moments.filter((m) => m.titleKey === 'pass_attempt');
      if (passes.length === 0) return { ...base, kind: 'not_enough_evidence', key: 'noPasses' };
      const completed = passes.filter((m) => m.outcome === 'completed').length;
      const incomplete = passes.filter((m) => m.outcome === 'incomplete').length;
      return { ...base, kind: 'answer', key: 'passes', moments: passes.slice(0, 5),
        params: { total: passes.length, completed, incomplete, unknown: passes.length - completed - incomplete } };
    }
    case 'improve': {
      const i = insights.find((x) => x.kind === 'improve');
      return i ? { ...base, kind: 'answer', key: 'improve', insight: i, moments: view.moments.filter((m) => i.momentIds.includes(m.id)) }
        : { ...base, kind: 'not_enough_evidence', key: 'noImprove' };
    }
    case 'well': {
      const i = insights.find((x) => x.kind === 'strength');
      return i ? { ...base, kind: 'answer', key: 'well', insight: i, moments: view.moments.filter((m) => i.momentIds.includes(m.id)) }
        : { ...base, kind: 'not_enough_evidence', key: 'noStrength' };
    }
    case 'identity':
      return { ...base, kind: 'answer', key: 'identity', params: {
        confirmedMin: Math.round(c.confirmedVisibleSec / 6) / 10, likelyMin: Math.round(c.likelyVisibleSec / 6) / 10,
        analysedMin: Math.round(c.analysedSec / 60), review: view.needsReview.length } };
    case 'review':
      return view.needsReview.length > 0
        ? { ...base, kind: 'answer', key: 'review', params: { count: view.needsReview.length }, moments: view.needsReview.slice(0, 5) }
        : { ...base, kind: 'answer', key: 'reviewNone' };
    case 'best_moment':
      return ranked.length > 0 ? { ...base, kind: 'answer', key: 'best', moments: ranked.slice(0, 1) }
        : { ...base, kind: 'not_enough_evidence', key: 'noMoments' };
    case 'moments':
      return view.moments.length > 0
        ? { ...base, kind: 'answer', key: 'moments', params: { count: view.moments.length }, moments: view.moments.slice(0, 6) }
        : { ...base, kind: 'not_enough_evidence', key: 'noMoments' };
    default:
      return { ...base, kind: 'not_enough_evidence', key: 'unknown' };
  }
}

/** Suggested first questions, only for things this report can actually answer. */
export function suggestedQuestions(report: TrackingReport | null): AskIntent[] {
  if (!report) return [];
  const view = buildMomentsView(report);
  const out: AskIntent[] = [];
  if (view.moments.length > 0) out.push('best_moment');
  if (view.needsReview.length > 0) out.push('review');
  if (report.offball?.status === 'measured') out.push('space');
  out.push('improve', 'identity', 'distance');
  return out.slice(0, 4);
}

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

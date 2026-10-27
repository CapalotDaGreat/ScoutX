/**
 * Match Review: the answer to the five questions, in priority order.
 *   A Hero - what PitchProof could verify for you in this match
 *   B Match story - when you were seen, by identity strength, with moment markers
 *   C Best moments
 *   D What went well          E What to work on
 *   F Analysis details (coverage, identity, limitations)
 *   G Ask PitchProof          H Next match focus
 * Simple view = A, C, D, E, H, G. Detailed view adds B and F. Scout view = evidence only
 * (confirmed moments, coverage, limitations - no coaching opinions).
 */
import type { TrackingDoc, TrackingReport, TrackingIdentityState } from '@/features/match-analysis/services/trackingPresentation';
import { buildCoachInsights, nextMatchFocus, recordingTips, type AgeBand, type Insight, type NextMatchFocus, type RecordingTip } from './coach';
import { buildMomentsView, type MomentCard, type MomentsView } from './moments';

export type ReviewView = 'simple' | 'detailed' | 'scout';
export type ReviewSectionId = 'hero' | 'story' | 'best' | 'well' | 'improve' | 'details' | 'ask' | 'focus';

export type StoryBucket = { start: number; end: number;
  /** strongest identity evidence inside the bucket */
  state: 'confirmed' | 'likely' | 'not_seen' | 'no_play';
  momentIds: string[] };

export type MatchReview = {
  status: 'partial' | 'complete';
  hero: { tone: 'strong' | 'limited' | 'none'; confirmedMoments: number; reviewMoments: number;
    confirmedMin: number; seenMin: number; analysedMin: number; analysedUntilSec: number | null };
  story: StoryBucket[];
  best: MomentCard[];
  well: Insight[];
  improve: Insight[];
  /** measured off-ball observations (with separate, uncertain interpretations) */
  observations: Insight[];
  limitations: Insight[];
  details: { coverage: TrackingReport['coverage']; numberSightings: number; confirmedByUser: number; engineVersion: string;
    physical: 'verified' | 'not_calibrated'; ballEventsMeasured: number };
  focus: NextMatchFocus;
  tips: RecordingTip[];
  moments: MomentsView;
  sections: ReviewSectionId[];
};

const SECTIONS: Record<ReviewView, ReviewSectionId[]> = {
  simple: ['hero', 'best', 'well', 'improve', 'focus', 'ask'],
  detailed: ['hero', 'story', 'best', 'well', 'improve', 'focus', 'details', 'ask'],
  scout: ['hero', 'story', 'best', 'details'],
};

export function storyBuckets(report: TrackingReport, cards: MomentCard[], bucketSec = 300): StoryBucket[] {
  const total = report.coverage.recordingSec;
  if (!(total > 0)) return [];
  const rank: Record<StoryBucket['state'], number> = { confirmed: 3, likely: 2, not_seen: 1, no_play: 0 };
  const stateOf = (s: TrackingIdentityState): StoryBucket['state'] =>
    s === 'CONFIRMED_VISIBLE' ? 'confirmed' : s === 'LIKELY_VISIBLE' ? 'likely' : s === 'NON_MATCH_PERIOD' || s === 'CONFIRMED_OFF_PITCH' ? 'no_play' : 'not_seen';
  const out: StoryBucket[] = [];
  for (let a = 0; a < total; a += bucketSec) {
    const b = Math.min(total, a + bucketSec);
    let best: StoryBucket['state'] = 'no_play';
    let sawPlay = false;
    for (const [s, e, st] of report.stateStrip) {
      if (e <= a || s >= b) continue;
      const k = stateOf(st);
      if (k !== 'no_play') sawPlay = true;
      if (rank[k] > rank[best]) best = k;
    }
    if (!sawPlay && report.stateStrip.length === 0) best = 'not_seen';
    out.push({ start: a, end: b, state: best,
      momentIds: cards.filter((c) => c.actionAt >= a && c.actionAt < b).map((c) => c.id) });
  }
  return out;
}

export function buildMatchReview(doc: TrackingDoc | null, view: ReviewView = 'simple',
  profile: { position?: string | null; ageBand?: AgeBand; goals?: Array<{ id: string; title: string }> } = {}): MatchReview | null {
  const report = doc?.report;
  if (!report) return null;
  const moments = buildMomentsView(report);
  const insights = view === 'scout' ? [] : buildCoachInsights(report, profile);
  const allLimits = buildCoachInsights(report, profile).filter((i) => i.kind === 'limitation');
  const tips = recordingTips(report);
  const confirmed = moments.moments.filter((m) => m.evidence === 'confirmed');
  const c = report.coverage;
  const tone: MatchReview['hero']['tone'] = confirmed.length >= 3 && c.confirmedVisibleSec >= 120 ? 'strong'
    : moments.moments.length + moments.needsReview.length > 0 ? 'limited' : 'none';
  const scoutCards = view === 'scout' ? confirmed : moments.moments;
  const best = [...scoutCards].sort((a, b) => b.rank - a.rank).slice(0, 3);
  return {
    status: doc?.scope === 'preliminary' ? 'partial' : 'complete',
    hero: { tone, confirmedMoments: confirmed.length, reviewMoments: moments.needsReview.length,
      confirmedMin: Math.round(c.confirmedVisibleSec / 6) / 10,
      seenMin: Math.round((c.confirmedVisibleSec + c.likelyVisibleSec) / 6) / 10,
      analysedMin: Math.round(c.analysedSec / 60), analysedUntilSec: report.analysedRange?.endSec ?? null },
    story: storyBuckets(report, view === 'scout' ? confirmed : [...moments.moments, ...moments.needsReview]),
    best,
    well: insights.filter((i) => i.kind === 'strength'),
    improve: insights.filter((i) => i.kind === 'improve'),
    observations: insights.filter((i) => i.kind === 'observation'),
    limitations: allLimits,
    details: { coverage: c, numberSightings: report.identity.numberSightings, confirmedByUser: report.identity.confirmedByUser,
      engineVersion: report.engineVersion,
      physical: report.physical.status === 'calibrated' && report.physical.productionVisible ? 'verified' : 'not_calibrated',
      ballEventsMeasured: report.events.length },
    focus: view === 'scout' ? null : nextMatchFocus(insights, tips, profile.goals),
    tips,
    moments,
    sections: SECTIONS[view],
  };
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseTrackingReport } from '../../functions/src/analysis/trackingV3.ts';
import type { TrackingDoc, TrackingProgressDoc, TrackingReport } from '../../src/features/match-analysis/services/trackingPresentation.ts';
import { answerQuestion, detectIntent, suggestedQuestions } from '../../src/features/match-review/services/ask.ts';
import { buildCoachInsights, nextMatchFocus, pickDrill, positionGroup, recordingTips } from '../../src/features/match-review/services/coach.ts';
import { comparability, developmentTrend, observationFrom } from '../../src/features/match-review/services/development.ts';
import { draftReel, presetAvailability, selectHighlights } from '../../src/features/match-review/services/highlights.ts';
import { deriveJourney, roundEstimate } from '../../src/features/match-review/services/journey.ts';
import { adjustClip, buildMomentsView, evidenceOf, indicatorAt, toMomentCard } from '../../src/features/match-review/services/moments.ts';
import { buildMatchReview } from '../../src/features/match-review/services/review.ts';

/** Real worker output for IMG_4809 / orange #20 (images removed), validated by the server parser. */
function fixture(name: 'auto' | 'answers'): TrackingReport {
  const raw = JSON.parse(readFileSync(new URL(`../fixtures/tracking40-img4809-${name}.json`, import.meta.url), 'utf8'));
  const report = parseTrackingReport(raw.report, raw.timeline);
  assert.ok(report, 'the real worker output passes server validation');
  return report as unknown as TrackingReport;
}

const doc = (report: TrackingReport, scope: 'preliminary' | 'full' = 'full'): TrackingDoc => ({ report, version: 1, stale: false, scope });

function synthetic(): TrackingReport {
  const base = fixture('auto');
  return {
    ...base,
    coverage: { ...base.coverage, confirmedVisibleSec: 400 },
    ball: { ...base.ball, contacts: 6 },
    events: [{ type: 'contact', start: 100, end: 101, identityState: 'CONFIRMED_VISIBLE' }],
    moments: [
      { id: 'm_960', kind: 'pass_attempt', kinds: ['pass_attempt', 'contact'], start: 100, end: 102, clipStart: 96, clipEnd: 104,
        identityState: 'CONFIRMED_VISIBLE', candidate: false, outcome: 'completed', indicator: [[100, 0.1, 0.1, 0.05, 0.1]] },
      { id: 'm_1960', kind: 'pass_attempt', kinds: ['pass_attempt'], start: 200, end: 202, clipStart: 196, clipEnd: 204,
        identityState: 'CONFIRMED_VISIBLE', candidate: false, outcome: 'completed', indicator: [[200, 0.1, 0.1, 0.05, 0.1]] },
      { id: 'm_2960', kind: 'pass_attempt', kinds: ['pass_attempt'], start: 300, end: 302, clipStart: 296, clipEnd: 304,
        identityState: 'CONFIRMED_VISIBLE', candidate: false, outcome: 'incomplete', indicator: [] },
      { id: 'm_3960', kind: 'pass_attempt', kinds: ['pass_attempt'], start: 400, end: 402, clipStart: 396, clipEnd: 404,
        identityState: 'LIKELY_VISIBLE', candidate: false, outcome: 'incomplete', indicator: [] },
      { id: 'm_4960', kind: 'carry', kinds: ['carry'], start: 500, end: 503, clipStart: 497, clipEnd: 505,
        identityState: 'CONFIRMED_VISIBLE', candidate: false, indicator: [] },
      { id: 'm_5960', kind: 'duel_candidate', kinds: ['duel_candidate'], start: 600, end: 601, clipStart: 596, clipEnd: 604,
        identityState: 'CONFIRMED_VISIBLE', candidate: true, indicator: [] },
    ],
  };
}

test('real recording: moments are honest - confirmed kept apart from moments that need review', () => {
  const auto = fixture('auto');
  const view = buildMomentsView(auto);
  assert.equal(view.moments.length + view.needsReview.length, auto.moments?.length);
  assert.equal(view.moments.length, 1, 'one confirmed on-camera moment without answers');
  assert.equal(view.needsReview.length, 5);
  assert.ok(view.needsReview.every((m) => m.evidence === 'needs_review' && m.askIdentity));
  assert.ok(view.moments.every((m) => m.evidence === 'confirmed'));
  const answered = buildMomentsView(fixture('answers'));
  assert.ok(answered.moments.length > view.moments.length, 'owner answers turn more footage into confirmed moments');
});

test('real recording: coach makes no performance claims it cannot support', () => {
  const insights = buildCoachInsights(fixture('auto'), { position: 'winger' });
  assert.equal(insights.filter((i) => i.kind !== 'limitation').length, 0, 'no strengths/improvements without measured actions');
  const topics = insights.map((i) => i.topic).sort();
  assert.deepEqual(topics, ['ball_visibility', 'identity', 'physical']);
  const tips = recordingTips(fixture('auto'));
  assert.ok(tips.length > 0 && tips.length <= 2);
  assert.deepEqual(nextMatchFocus(insights, tips), { kind: 'recording', tip: tips[0] });
});

test('real recording: Ask refuses distance/goals, answers identity with the report numbers', () => {
  const r = fixture('auto');
  const km = answerQuestion('How many km did I run?', r);
  assert.equal(km.kind, 'cannot_verify');
  assert.equal(km.key, 'distanceUncalibrated');
  assert.equal(answerQuestion('Wie schnell war mein Sprint?', r).key, 'speedUncalibrated');
  assert.equal(answerQuestion('Did I score a goal?', r).kind, 'cannot_verify');
  const who = answerQuestion('How sure are you that it was me?', r);
  assert.equal(who.key, 'identity');
  assert.equal(who.params.confirmedMin, Math.round(r.coverage.confirmedVisibleSec / 6) / 10);
  assert.equal(answerQuestion('show me my best moment', r).moments.length, 1);
  assert.equal(answerQuestion('What should I improve?', r).kind, 'not_enough_evidence');
  assert.ok(suggestedQuestions(r).includes('review'));
});

test('intent detection across the supported languages', () => {
  const cases: Array<[string, string]> = [
    ['Wie viele Kilometer bin ich gelaufen?', 'distance'], ['¿Cuántos km corrí?', 'distance'], ['Combien de distance ai-je couru ?', 'distance'],
    ['Quanti km ho percorso?', 'distance'], ['Hoeveel afstand heb ik gelopen?', 'distance'], ['Quantos km corri? distância', 'distance'],
    ['What should I work on?', 'improve'], ['Was kann ich verbessern?', 'improve'], ['¿Qué puedo mejorar?', 'improve'],
    ['How were my passes?', 'passing'], ['What did I do well?', 'well'], ['Show my best moment', 'best_moment'],
    ['When was I on the ball?', 'moments'], ['xyz', 'unknown'],
  ];
  for (const [q, intent] of cases) assert.equal(detectIntent(q), intent, q);
});

test('coach: at most two strengths and two improvements, each with evidence and where to see it', () => {
  const insights = buildCoachInsights(synthetic(), { position: 'centre midfield' });
  const strengths = insights.filter((i) => i.kind === 'strength');
  const improve = insights.filter((i) => i.kind === 'improve');
  assert.ok(strengths.length <= 2 && improve.length <= 2);
  const passing = strengths.find((i) => i.topic === 'passing');
  assert.equal(passing?.params.count, 2);
  assert.deepEqual(passing?.momentIds.sort(), ['m_1960', 'm_960']);
  const fix = improve.find((i) => i.topic === 'passing_accuracy');
  assert.equal(fix?.params.count, 2);
  assert.ok(fix?.drill);
  assert.ok(!insights.some((i) => i.momentIds.includes('m_5960')), 'duel candidates never feed coaching');
  assert.equal(positionGroup('Left winger'), 'winger');
  assert.equal(positionGroup('Torwart'), 'goalkeeper');
  assert.equal(positionGroup('Innenverteidiger'), 'defender');
  assert.equal(pickDrill('passing_accuracy', 'goalkeeper', 'adult')?.id, 'distribution_targets');
  assert.ok(pickDrill('involvement', 'winger', 'youth')?.youth);
  const focus = nextMatchFocus(insights, [], [{ id: 'g1', title: 'Better passing under pressure' }]);
  assert.equal(focus?.kind, 'skill');
  assert.equal(focus?.kind === 'skill' ? focus.matchesGoalId : null, 'g1');
});

test('moments: evidence labels, indicator interpolation, adjustable clip', () => {
  const r = synthetic();
  const cards = (r.moments ?? []).map(toMomentCard);
  assert.deepEqual(cards.map((c) => c.evidence), ['confirmed', 'confirmed', 'confirmed', 'estimated', 'confirmed', 'needs_review']);
  assert.equal(evidenceOf({ ...r.moments![0], kind: 'spell', identityState: 'LIKELY_VISIBLE' }), 'needs_review');
  const ind: Array<[number, number, number, number, number]> = [[10, 0, 0, 0.1, 0.2], [11, 0.2, 0.2, 0.1, 0.2]];
  assert.deepEqual(indicatorAt(ind, 10.5), { x: 0.1, y: 0.1, w: 0.1, h: 0.2 });
  assert.equal(indicatorAt(ind, 20), null, 'no box far from a measured sample');
  assert.deepEqual(adjustClip({ clipStart: 2, clipEnd: 8 }, -5, 1, 100), { clipStart: 0, clipEnd: 9 });
  assert.deepEqual(adjustClip({ clipStart: 2, clipEnd: 8 }, 4, -4, 100), { clipStart: 6, clipEnd: 9 });
  const filtered = buildMomentsView(r, 'passing');
  assert.ok(filtered.moments.every((m) => m.category === 'passing'));
});

test('highlights: evidence-first, diverse, never auto-including uncertain moments, private drafts', () => {
  const cards = (synthetic().moments ?? []).map(toMomentCard);
  const avail = presetAvailability(cards, 'midfielder');
  assert.equal(avail.find((p) => p.preset === 'defensive')?.available, false);
  assert.equal(avail.find((p) => p.preset === 'defensive')?.reason, 'defensive_not_validated');
  assert.equal(avail.find((p) => p.preset === 'goalkeeper')?.reason, 'not_goalkeeper');
  assert.equal(avail.find((p) => p.preset === 'my_match')?.available, true);
  const clips = selectHighlights(cards, 'my_match', 60);
  assert.ok(!clips.some((c) => c.momentId === 'm_5960'), 'duel candidate excluded from automatic reels');
  assert.ok(clips.every((c, i) => i === 0 || c.inSec >= clips[i - 1].outSec), 'no overlapping footage, match order');
  const custom = selectHighlights(cards, 'custom', 60, ['m_5960']);
  assert.deepEqual(custom.map((c) => c.momentId), ['m_5960'], 'custom reels use exactly what the player picked');
  const reel = draftReel('u1', 'job_1', 'my_match', clips, 'My match', new Date(0), 'reel_1');
  assert.equal(reel.privacy, 'private');
  assert.equal(reel.status, 'draft');
  assert.equal(reel.segments[0].mediaId, 'footage_job_1');
  const realCards = buildMomentsView(fixture('auto')).moments;
  assert.equal(presetAvailability(realCards, 'winger').find((p) => p.preset === 'ball')?.available, false,
    'no ball-involvement reel when no ball action was measured');
});

test('journey: stages follow persisted facts; estimates only after measurement; problems explain the next step', () => {
  const t0 = Date.parse('2026-10-27T10:00:00Z');
  const progress: TrackingProgressDoc = {
    generation: 1, durationSec: 720,
    plan: [{ index: 0, startSec: 0, endSec: 120 }, { index: 1, startSec: 120, endSec: 420 }, { index: 2, startSec: 420, endSec: 720 }],
    segments: { 0: { status: 'running', attempts: 1 }, 1: { status: 'queued', attempts: 0 }, 2: { status: 'queued', attempts: 0 } },
    startedAt: new Date(t0).toISOString(), updatedAt: new Date(t0).toISOString(), resolving: null, preliminary: null, full: null,
    outcome: null, blocked: null,
  };
  let j = deriveJourney(progress, null, t0 + 60_000)!;
  assert.deepEqual(j.stages.map((s) => s.status), ['done', 'active', 'pending', 'pending', 'pending', 'pending', 'pending']);
  assert.equal(j.remainingSec, null, 'nothing measured yet - no estimate');
  assert.deepEqual(j.parts, { done: 0, total: 3 });
  progress.segments[0] = { status: 'done', attempts: 1, processingSec: 200, doneAt: new Date(t0 + 240_000).toISOString() };
  progress.resolving = 'preliminary';
  j = deriveJourney(progress, null, t0 + 300_000)!;
  assert.equal(j.remainingSec, 1200, '600 s of video left at the measured 2 s per second');
  assert.equal(j.stages[2].status, 'active');
  const prelim = doc(fixture('auto'), 'preliminary');
  j = deriveJourney(progress, prelim, t0 + 300_000)!;
  assert.equal(j.partial, true);
  assert.equal(j.unlocked.moments, true);
  assert.equal(j.unlocked.coaching, false, 'coaching waits for the full report');
  assert.equal(j.stages[3].status, 'done');
  j = deriveJourney({ ...progress, outcome: 'interrupted' }, prelim, t0 + 300_000)!;
  assert.deepEqual(j.problem, { kind: 'interrupted', action: 'resume', retryHelps: true });
  assert.equal(j.remainingSec, null);
  assert.ok(j.stages.some((s) => s.status === 'blocked'));
  j = deriveJourney({ ...progress, blocked: 'consent_required' }, null)!;
  assert.deepEqual(j.problem, { kind: 'consent_required', action: 'give_consent', retryHelps: false });
  const done = { ...progress, segments: { 0: { status: 'done' as const, attempts: 1 }, 1: { status: 'done' as const, attempts: 1 }, 2: { status: 'done' as const, attempts: 1 } },
    full: { scope: 'full' as const, parts: 3, analysedEndSec: 720, moments: 6, reviewQuestions: 3, at: '' } };
  j = deriveJourney(done, doc(fixture('auto')))!;
  assert.equal(j.complete, true);
  assert.ok(j.stages.every((s) => s.status === 'done'));
  assert.equal(deriveJourney(null, null), null);
  assert.deepEqual(roundEstimate(130), { unit: 'minutes', value: 5 });
  assert.deepEqual(roundEstimate(3 * 3600 + 100), { unit: 'hours', value: 3 });
});

test('match review: section order per view, scout view without coaching, partial status', () => {
  const r = fixture('auto');
  const simple = buildMatchReview(doc(r, 'preliminary'))!;
  assert.equal(simple.status, 'partial');
  assert.deepEqual(simple.sections, ['hero', 'best', 'well', 'improve', 'focus', 'ask']);
  assert.equal(simple.hero.tone, 'limited');
  assert.equal(simple.hero.confirmedMoments, 1);
  assert.equal(simple.hero.reviewMoments, 5);
  assert.equal(simple.story.length, Math.ceil(r.coverage.recordingSec / 300));
  assert.ok(simple.story.some((b) => b.state === 'confirmed'));
  const scout = buildMatchReview(doc(synthetic()), 'scout')!;
  assert.equal(scout.well.length + scout.improve.length, 0);
  assert.equal(scout.focus, null);
  assert.ok(scout.best.every((m) => m.evidence === 'confirmed'));
  assert.ok(scout.limitations.length > 0, 'limitations stay visible to scouts');
  assert.equal(buildMatchReview({ report: null, version: 0, stale: false }), null);
});

test('development: only comparable matches form a trend', () => {
  const full = synthetic();
  const a = observationFrom('a', '2026-09-01', { report: full, version: 1, stale: false, scope: 'full' })!;
  const b = observationFrom('b', '2026-10-01', { report: { ...full, coverage: { ...full.coverage, confirmedVisibleSec: 1200 } }, version: 1, stale: false, scope: 'full' })!;
  const weak = observationFrom('c', '2026-10-10', doc(fixture('auto')))!;
  assert.equal(comparability(a, b), 'low_confirmed_coverage');
  const strongA = { ...a, confirmedSec: 900 };
  assert.equal(comparability(strongA, b), null);
  assert.equal(comparability({ ...strongA, engineMajor: '2' }, b), 'engine_changed');
  assert.equal(comparability({ ...strongA, scope: 'preliminary' }, b), 'partial_report');
  const trend = developmentTrend([strongA, b]);
  assert.equal(trend.points.length, 2);
  const none = developmentTrend([strongA, b, weak]);
  assert.equal(none.points.length, 0, 'latest match not comparable -> no trend shown');
  assert.ok(none.excluded.some((e) => e.jobId === 'c'));
});

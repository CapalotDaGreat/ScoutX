import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseTrackingReport } from '../../functions/src/analysis/trackingV3.ts';
import type { TrackingReport } from '../../src/features/match-analysis/services/trackingPresentation.ts';
import { answerQuestion, detectIntent } from '../../src/features/match-review/services/ask.ts';
import { buildCoachInsights, groupOfRole, lineOfRole, positionRole } from '../../src/features/match-review/services/coach.ts';
import { focusFollowUps, goalTopic } from '../../src/features/match-review/services/development.ts';
import { MAX_ZOOM, focusTransform, smoothedTarget } from '../../src/features/match-review/services/virtualCamera.ts';

function fixture(name: 'auto' | 'answers'): TrackingReport {
  const raw = JSON.parse(readFileSync(new URL(`../fixtures/tracking40-img4809-${name}.json`, import.meta.url), 'utf8'));
  return parseTrackingReport(raw.report, raw.timeline) as unknown as TrackingReport;
}

test('5.0 position roles: eight roles in several languages, mapped to drill groups and lines', () => {
  const cases: Array<[string, string]> = [['Goalkeeper', 'goalkeeper'], ['Innenverteidiger', 'centre_back'], ['left back', 'full_back'],
    ['Lateral derecho', 'full_back'], ['CDM', 'defensive_mid'], ['Sechser', 'defensive_mid'], ['central midfielder', 'central_mid'],
    ['Trequartista', 'attacking_mid'], ['Winger', 'winger'], ['Ailier', 'winger'], ['Striker', 'striker'], ['Stürmer', 'striker'], ['', 'unknown']];
  for (const [p, r] of cases) assert.equal(positionRole(p), r, p);
  assert.equal(groupOfRole('full_back'), 'defender');
  assert.equal(lineOfRole('defensive_mid'), 'defence');
  assert.equal(lineOfRole('winger'), 'attack');
});

test('5.0 coach: a short confirmed sequence gives a narrow, clip-level, role-specific observation; none without it', () => {
  const base = fixture('auto');
  const none = buildCoachInsights(base, { position: 'winger' });
  assert.ok(!none.some((i) => i.id.startsWith('sequence_')), 'the real recording has no qualifying sequence -> no invented insight');
  assert.ok(none.every((i) => i.tier >= 1 && i.tier <= 4));
  assert.ok(none.filter((i) => i.kind === 'limitation').every((i) => i.tier === 4));
  const withSeq: TrackingReport = { ...base, offball: { status: 'insufficient', confirmedSec: 20, minConfirmedSec: 60,
    sequences: [{ start: 100, end: 108.5, kind: 'free', measuredSec: 7.9, nearestOpponentMedianBH: 4.2, freeShare: 0.86, tightShare: 0, nearestTeammateMedianBH: 2.1 },
      { start: 300, end: 306, kind: 'mixed', measuredSec: 5, nearestOpponentMedianBH: 2, freeShare: 0.3, tightShare: 0.2 }] } };
  const ins = buildCoachInsights(withSeq, { position: 'Winger' });
  const seq = ins.filter((i) => i.id.startsWith('sequence_'));
  assert.equal(seq.length, 1, 'mixed sequences support no observation');
  assert.equal(seq[0].kind, 'observation');
  assert.deepEqual(seq[0].clips, [{ start: 100, end: 108.5 }]);
  assert.equal(seq[0].whyKey, 'review.coach.sequence.free.why_attack');
  assert.deepEqual(seq[0].params, { seconds: 9, pct: 86, median: 4.2 });
  const lim = ins.find((i) => i.id === 'positioning_limit');
  assert.equal(lim?.textKey, 'review.coach.positioning.limitationClips', 'the match-level limitation says only clips can be described');
  const def = buildCoachInsights(withSeq, { position: 'centre back' }).find((i) => i.id.startsWith('sequence_'));
  assert.equal(def?.whyKey, 'review.coach.sequence.free.why_defence');
});

test('5.0 Ask: new intents answer from evidence or say what is missing', () => {
  assert.equal(detectIntent('Compare my first and second half'), 'halves');
  assert.equal(detectIntent('Show my defensive actions'), 'defending');
  assert.equal(detectIntent('What should I practise this week?'), 'practice');
  assert.equal(detectIntent('Where did I position myself well?'), 'space');
  assert.equal(detectIntent('Did I make good supporting runs?'), 'space');
  assert.equal(detectIntent('Was soll ich diese Woche üben?'), 'practice');
  assert.equal(detectIntent('What should I work on?'), 'improve');
  const r = fixture('answers');
  assert.equal(answerQuestion('Compare my first and second half', r).key, 'halvesUnknown', 'no half-time known -> no split');
  const withHt: TrackingReport = { ...r, periods: [...r.periods, { start: 900, end: 1300, kind: 'non_play', label: 'half_time', source: 'user' }] };
  const h = answerQuestion('Compare my first and second half', withHt);
  assert.equal(h.key, 'halves');
  assert.ok(typeof h.params.firstMin === 'number' && typeof h.params.secondMoments === 'number');
  const adv = answerQuestion('What could I have done differently at 32:40?', r);
  assert.ok(adv.key === 'atTimeAdvice' || adv.key === 'atTimeAdviceUnsure' || adv.key === 'atTimeNone');
  assert.notEqual(adv.kind, 'answer', 'alternatives are never presented as a measured answer');
  const d = answerQuestion('Show my defensive actions', r);
  assert.ok(['defendingCandidates', 'noDefending'].includes(d.key));
});

test('5.0 virtual camera keeps context: zoom capped, no empty borders, identity without a track', () => {
  const view = { w: 360, h: 240 };
  const rect = { x: 0, y: 37.5, w: 360, h: 202.5 }; // 16:9 contain-fit (letterboxed vertically)
  assert.deepEqual(focusTransform(null, view, rect), { scale: 1, translateX: 0, translateY: 0 });
  const small = focusTransform({ cx: 0.5, cy: 0.5, h: 0.05 }, view, rect);
  assert.ok(small.scale <= MAX_ZOOM && small.scale > 1);
  const big = focusTransform({ cx: 0.5, cy: 0.5, h: 0.4 }, view, rect);
  assert.equal(big.scale, 1, 'a large player is already in context: no zoom');
  const edge = focusTransform({ cx: 0.98, cy: 0.5, h: 0.05 }, view, rect);
  assert.ok(Math.abs(edge.translateX) <= (rect.w * edge.scale - view.w) / 2 + 0.1, 'frame edge never enters the view');
  const t = smoothedTarget([[10, 0.1, 0.1, 0.1, 0.2], [10.5, 0.3, 0.1, 0.1, 0.2]], 10.25);
  assert.ok(t && t.cx > 0.15 && t.cx < 0.35, 'centre is smoothed between samples');
  assert.equal(smoothedTarget([[10, 0.1, 0.1, 0.1, 0.2]], 20), null);
});

test('5.0 focus follow-up shows evidence about a saved focus without grading it', () => {
  const r = fixture('answers');
  const goals = [
    { id: 'g1', title: 'Work on: finding space', evidenceIds: ['job_old:m_1', 'coach-topic:positioning'] },
    { id: 'g2', title: 'Work on: passing', evidenceIds: ['job_old:m_2', 'coach-topic:passing'] },
    { id: 'g3', title: 'Old free-text goal', evidenceIds: [] },
    { id: 'g4', title: 'From this match', evidenceIds: ['job_now:m_3', 'coach-topic:passing'] },
  ];
  assert.equal(goalTopic(goals[0]), 'positioning');
  const f = focusFollowUps(goals, 'job_now', r);
  assert.deepEqual(f.map((x) => x.goalId), ['g1', 'g2']);
  assert.ok(f.every((x) => x.status === 'evidence' || x.status === 'insufficient'));
  assert.equal(f[0].status, 'insufficient', 'the real recording has no off-ball evidence');
  const withSeq: TrackingReport = { ...r, offball: { status: 'insufficient', confirmedSec: 20, minConfirmedSec: 60,
    sequences: [{ start: 100, end: 108, kind: 'tight', measuredSec: 7, nearestOpponentMedianBH: 0.8, freeShare: 0, tightShare: 0.7 }] } };
  assert.deepEqual(focusFollowUps(goals, 'job_now', withSeq)[0].clips, [{ start: 100, end: 108 }]);
});

test('5.0 real recording (IMG_4809, 39 answers, 7 discovery sightings): coaching from measured evidence only', () => {
  const raw = JSON.parse(readFileSync(new URL('../fixtures/tracking50-img4809-answers.json', import.meta.url), 'utf8'));
  const r = parseTrackingReport(raw.report, raw.timeline) as unknown as TrackingReport;
  assert.ok(r && r.coverage.confirmedVisibleSec >= 60);
  const ins = buildCoachInsights(r, { position: 'winger' });
  const obs = ins.filter((i) => i.kind === 'observation').map((i) => i.id);
  assert.deepEqual(obs, ['positioning_observation', 'sequence_free_1356']);
  assert.ok(!ins.some((i) => i.kind === 'strength' || i.kind === 'improve'), 'no ball actions measured -> no strengths/improvements');
  const auto = JSON.parse(readFileSync(new URL('../fixtures/tracking50-img4809-auto.json', import.meta.url), 'utf8'));
  const ra = parseTrackingReport(auto.report, auto.timeline) as unknown as TrackingReport;
  assert.ok(!buildCoachInsights(ra, { position: 'winger' }).some((i) => i.kind === 'observation'), 'without answers: limitation, no observation');
});

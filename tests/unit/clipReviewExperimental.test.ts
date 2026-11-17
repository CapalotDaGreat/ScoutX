import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildClipReviewExperimental, confirmedThroughout, isClipReviewStale, providerTextSupported, templateText,
  type FrameTimeline, type WorkerSequence,
} from '../../src/features/match-review/services/clipReviewExperimental.ts';

/** 10 fps timeline 0..40 s; `likely` ranges are LIKELY_VISIBLE, `absent` ranges have no target box. */
function timeline(likely: Array<[number, number]> = [], absent: Array<[number, number]> = []): FrameTimeline {
  const times: number[] = []; const states: string[] = []; const present: boolean[] = [];
  for (let k = 0; k <= 400; k += 1) {
    const t = Math.round(k) / 10;
    times.push(t);
    const off = absent.some(([a, b]) => t >= a && t <= b);
    present.push(!off);
    states.push(off ? 'UNKNOWN' : likely.some(([a, b]) => t >= a && t <= b) ? 'LIKELY_VISIBLE' : 'CONFIRMED_VISIBLE');
  }
  return { times, states, present };
}
const free = (start: number, end: number): WorkerSequence =>
  ({ start, end, kind: 'free', measuredSec: (end - start) * 0.9, nearestOpponentMedianBH: 5.8, freeShare: 1, tightShare: 0 });
const tight = (start: number, end: number): WorkerSequence =>
  ({ start, end, kind: 'tight', measuredSec: (end - start) * 0.95, nearestOpponentMedianBH: 0.75, freeShare: 0, tightShare: 0.816 });
const base = { recordingSec: 40, line: 'attack' as const, answersFingerprint: 'a1' };

test('supported positive action: a confirmed free clip becomes a clip-only strength with a practice target', async () => {
  const r = await buildClipReviewExperimental({ ...base, sequences: [free(10.8, 18.8)], timeline: timeline() });
  assert.equal(r.items.length, 1);
  const it = r.items[0];
  assert.equal(it.kind, 'strength');
  assert.equal(it.scope, 'this_clip_only');
  assert.equal(it.identitySource, 'automatic');
  assert.deepEqual(it.observation, { pattern: 'free', seconds: 8, sharePct: 100, nearestOpponentMedianBH: 5.8 });
  assert.match(it.text, /10\.8-18\.8 s/);
  assert.match(it.text, /may mean/); // interpretation stays uncertain
  assert.match(it.text, /this clip only/);
  assert.ok(it.practice && it.practice.successKey);
});

test('supported improvement opportunity: a confirmed tight clip, kept separate from interpretation', async () => {
  const r = await buildClipReviewExperimental({ ...base, sequences: [tight(20, 28)], timeline: timeline() });
  assert.equal(r.items[0].kind, 'improve');
  assert.equal(r.items[0].observation.sharePct, 82);
  assert.equal(r.items[0].practice?.drillId, 'first_touch_away');
});

test('defensive roles get an observation only: the same pattern is not judged good or bad', async () => {
  const r = await buildClipReviewExperimental({ ...base, line: 'defence', sequences: [tight(20, 28)], timeline: timeline() });
  assert.equal(r.items[0].kind, 'observation');
  assert.equal(r.items[0].practice, null);
});

test('ambiguous identity: one LIKELY frame inside the clip is enough to refuse it', async () => {
  const r = await buildClipReviewExperimental({ ...base, sequences: [free(10.8, 18.8)], timeline: timeline([[14.0, 14.0]]) });
  assert.equal(r.items.length, 0);
  assert.deepEqual(r.insufficient[0], { clip: { start: 10.8, end: 18.8 }, reason: 'identity_not_confirmed_throughout', recovery: 'confirm_identity_in_review' });
});

test('regression: a clip starting mid-second is judged on frames, not on the 1-s majority strip', () => {
  // the 1,170.8-1,178.8 s case from IMG_4809: the second 1,170 is mostly LIKELY, the clip itself is all CONFIRMED
  const tl = timeline([[10.0, 10.7]]);
  assert.equal(confirmedThroughout(tl, 10.8, 18.8), true);
  assert.equal(confirmedThroughout(tl, 10.5, 18.8), false);
});

test('gaps and missing target boxes inside the clip are refused', () => {
  assert.equal(confirmedThroughout(timeline([], [[12.0, 12.6]]), 10.8, 18.8), false);
  assert.equal(confirmedThroughout(timeline(), 39.0, 45.0), false); // clip runs past the timeline end
});

test('insufficient temporal context: under 6 s is refused even when fully confirmed', async () => {
  const r = await buildClipReviewExperimental({ ...base, sequences: [free(10, 15.5)], timeline: timeline() });
  assert.equal(r.insufficient[0].reason, 'too_short');
});

test('wrong-player evidence: an owner "not me" answer near the clip blocks it', async () => {
  const r = await buildClipReviewExperimental({ ...base, sequences: [free(10.8, 18.8)], timeline: timeline(),
    answers: [{ t: 19.9, answer: 'not_me' }] });
  assert.equal(r.items.length, 0);
  assert.equal(r.insufficient[0].reason, 'owner_correction_nearby');
  assert.equal(r.insufficient[0].recovery, 'reanalyse_after_corrections');
});

test('owner taps mark the clip owner-assisted and add the limitation; they do not certify it', async () => {
  const r = await buildClipReviewExperimental({ ...base, sequences: [free(10.8, 18.8)], timeline: timeline(),
    answers: [{ t: 5, answer: 'is_me' }] });
  assert.equal(r.items[0].identitySource, 'owner_assisted');
  assert.ok(r.items[0].limitations.includes('identity_relies_on_owner_tap'));
  // the tap does not rescue a clip whose own frames are not confirmed
  const r2 = await buildClipReviewExperimental({ ...base, sequences: [free(10.8, 18.8)], timeline: timeline([[15, 15.3]]),
    answers: [{ t: 11, answer: 'is_me' }] });
  assert.equal(r2.items.length, 0);
});

test('contradictory observations over the same time are both refused', async () => {
  const r = await buildClipReviewExperimental({ ...base, sequences: [free(10, 18), tight(14, 22)], timeline: timeline() });
  assert.equal(r.items.length, 0);
  assert.deepEqual(r.insufficient.map((x) => x.reason), ['contradictory', 'contradictory']);
});

test('invalid citations and unsupported values are refused', async () => {
  const r = await buildClipReviewExperimental({ ...base, timeline: timeline(), sequences: [
    free(35, 46), // beyond the recording
    { ...free(10, 18), freeShare: 0.5 }, // "free" without the share that defines it
    { ...tight(20, 28), tightShare: 0.7, freeShare: 0.5 }, // shares add up to more than 100 %
    { ...free(30, 38), measuredSec: 2 }, // opponent measured on too few frames
    { start: 0.5, end: 7.5, kind: 'unmeasured' },
    { start: 0.5, end: 7.5, kind: 'mixed', measuredSec: 7, nearestOpponentMedianBH: 2, freeShare: 0.4, tightShare: 0.3 },
  ] });
  assert.equal(r.items.length, 0);
  assert.deepEqual(r.insufficient.map((x) => x.reason),
    ['outside_recording', 'unsupported_values', 'unsupported_values', 'not_measurable', 'contradictory', 'contradictory']);
  const r2 = await buildClipReviewExperimental({ ...base, timeline: timeline(), sequences: [{ start: 0.5, end: 7.5, kind: 'unmeasured' }] });
  assert.equal(r2.insufficient[0].reason, 'not_measurable');
});

test('provider failure falls back to the template; unsupported provider claims are rejected', async () => {
  const s = [free(10.8, 18.8)];
  const failed = await buildClipReviewExperimental({ ...base, sequences: s, timeline: timeline(), provider: async () => { throw new Error('503'); } });
  assert.equal(failed.items[0].textSource, 'template_after_provider_failure');
  const invented = await buildClipReviewExperimental({ ...base, sequences: s, timeline: timeline(),
    provider: async () => 'You sprinted at 24 km/h into 12 m of space and your team-mate missed you.' });
  assert.equal(invented.items[0].textSource, 'template_after_provider_rejected');
  assert.equal(invented.items[0].text, templateText(invented.items[0]));
  const ok = await buildClipReviewExperimental({ ...base, sequences: s, timeline: timeline(),
    provider: async () => 'From 10.8 to 18.8 s you stood in open space (100% of measured frames, median 5.8 body heights). Keep showing for the ball.' });
  assert.equal(ok.items[0].textSource, 'provider');
  assert.equal(providerTextSupported('From 10.8 s you were 9 body heights away', ok.items[0]), false);
});

test('owner correction after the review makes it stale', async () => {
  const r = await buildClipReviewExperimental({ ...base, sequences: [free(10.8, 18.8)], timeline: timeline() });
  assert.equal(isClipReviewStale(r, 'a1'), false);
  assert.equal(isClipReviewStale(r, 'a2'), true);
});

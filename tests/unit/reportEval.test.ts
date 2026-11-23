import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adaptReport, compareRuns, overlapSec, scoreClip, scoreCorpus, wilson, type ClipLabels, type CorpusClip, type PredictedReport, type Split,
} from './support/reportEval.ts';

// SYNTHETIC labels: they test the scorer's arithmetic and gating. They are not match ground truth.
const labels = (over: Partial<ClipLabels> = {}): ClipLabels => ({
  clipId: 'c1', split: 'development', sourceSha256: 'a'.repeat(64), synthetic: true, reviewers: ['r1', 'r2'], blinded: true,
  visibleIntervals: [[10, 30]], absentIntervals: [[40, 60]], events: [{ type: 'contact', t: 12 }, { type: 'contact', t: 25 }], ...over,
});
const moment = (id: string, start: number, end: number, identityState = 'CONFIRMED_VISIBLE') => ({ id, kind: 'spell', start, end, identityState });
const report = (over: Partial<PredictedReport> = {}): PredictedReport => ({
  scope: 'full', moments: [moment('m1', 12, 20)], events: [{ type: 'contact', start: 12.5, end: 13 }], ...over,
});
const clip = (split: Split, id: string, l: ClipLabels | null, r: PredictedReport | null): CorpusClip => ({ clipId: id, split, labels: l, report: r });

test('wrong-player claims, supported claims and unverified claims are counted separately', () => {
  const s = scoreClip(labels(), report({ moments: [moment('ok', 12, 20), moment('bad', 42, 50), moment('gap', 31, 38), moment('weak', 70, 80, 'AMBIGUOUS')] }));
  assert.equal(s.claims, 4, 'three claimed moments (the ambiguous one is not a claim) and the event');
  assert.equal(s.claimsSupported, 2);
  assert.equal(s.claimsWrongPlayer, 1);
  assert.equal(s.claimsUnverified, 1, 'time nobody labelled is never counted as correct');
});

test('event precision, recall and timestamp error are ratios of raw counts', () => {
  const r = report({ events: [{ type: 'contact', start: 12.5, end: 13 }, { type: 'contact', start: 90, end: 91 }, { type: 'pass', start: 25, end: 26 }] });
  const res = scoreCorpus([clip('development', 'c1', labels(), r)]);
  assert.equal(res.development.eventPrecision, 1 / 3, 'one of three predicted events matches a labelled event of the same type');
  assert.equal(res.development.eventRecall, 1 / 2);
  assert.equal(res.development.meanTimestampErrorSec, 0.75);
});

test('event matching maximises matches independently of event order', () => {
  const l = labels({ events: [{ type: 'contact', t: 10 }, { type: 'contact', t: 12 }] });
  const events = [{ type: 'contact', start: 11, end: 11 }, { type: 'contact', start: 8, end: 8 }];
  const a = scoreClip(l, report({ events }));
  const b = scoreClip(l, report({ events: [...events].reverse() }));
  assert.equal(a.eventsMatched, 2);
  assert.equal(a.timestampErrorSumSec, 3);
  assert.deepEqual(a, b);
  assert.equal(scoreClip(l, report({ events: [{ ...events[0], identityState: 'AMBIGUOUS' }] })).eventsPredicted, 0);
});

test('overlapping annotations cannot inflate support and points do not borrow nearby evidence', () => {
  assert.equal(overlapSec([0, 10], [[0, 4], [0, 4], [2, 5]]), 5);
  const l = labels({ visibleIntervals: [[10, 12], [10, 12]], absentIntervals: [] });
  assert.equal(scoreClip(l, report({ moments: [moment('overlap', 10, 20)], events: [] })).claimsSupported, 0);
  assert.equal(scoreClip(l, report({ moments: [moment('near', 9.9, 9.9)], events: [] })).claimsSupported, 0);
});

test('unverified claims cannot dilute the wrong-player rate or imply a measured zero', () => {
  const l = labels();
  const summary = (moments: ReturnType<typeof moment>[]) => scoreCorpus([clip('development', 'c1', l, report({ moments, events: [] }))]).development;
  const known = [moment('ok', 12, 20), moment('wrong', 42, 50)];
  assert.equal(summary(known).wrongPlayerRate, 0.5);
  assert.equal(summary([...known, moment('unknown', 80, 90)]).wrongPlayerRate, 0.5);
  assert.equal(summary([moment('unknown', 80, 90)]).wrongPlayerRate, null);
});

test('duplicate clips, mismatched labels and invalid timestamps fail before scoring', () => {
  const c = clip('development', 'c1', labels(), report());
  assert.throws(() => scoreCorpus([c, c]), /unique/);
  assert.throws(() => scoreCorpus([{ ...c, labels: labels({ split: 'heldout' }) }]), /mismatch/);
  assert.throws(() => scoreCorpus([{ ...c, labels: labels({ visibleIntervals: [[30, 10]] }) }]), /interval/);
  assert.throws(() => scoreCorpus([{ ...c, labels: labels({ visibleIntervals: [[40, 50]] }) }]), /conflicting/);
  assert.throws(() => scoreCorpus([{ ...c, report: report({ moments: [moment('bad', NaN, 20)] }) }]), /timestamp/);
});

test('a report is usable only when it is full, makes a claim and makes no wrong-player claim', () => {
  const l = labels();
  assert.equal(scoreClip(l, report()).usable, true);
  assert.equal(scoreClip(l, report({ scope: 'preliminary' })).usable, false);
  assert.equal(scoreClip(l, report({ moments: [], events: [] })).usable, false, 'a report with no claim helps nobody');
  assert.equal(scoreClip(l, report({ moments: [moment('bad', 42, 50)] })).usable, false);
  assert.equal(scoreClip(l, null).usable, false, 'a failed run counts against the usable share');
  assert.equal(scoreClip(l, report({ moments: [moment('gap', 31, 38)], events: [] })).usable, false, 'claims nobody could verify do not make a report usable');
});

test('narrative claims need cited frames that were supplied and are not from a reviewed-absent interval', () => {
  const frames = [{ id: 'f0', t: 12 }, { id: 'f1', t: 45 }];
  const answer = (evidenceFrames: string[]) => ({ momentId: 'm1', frames, answer: { observation: 'x', evidenceFrames } });
  const s = scoreClip(labels(), report({ answers: [answer(['f0']), answer(['f1']), answer(['f9']), answer([])] }));
  assert.equal(s.answers, 4);
  assert.equal(s.answersSupported, 1);
});

test('held-out results are never valid without enough blinded, independent, real labels, and never merge with development', () => {
  const dev = clip('development', 'dev', labels({ clipId: 'dev' }), report());
  const held = clip('heldout', 'held', labels({ clipId: 'held', split: 'heldout', reviewers: ['r1'], blinded: false }), report());
  const res = scoreCorpus([dev, held]);
  assert.equal(res.development.clips, 1);
  assert.equal(res.heldout.clips, 1);
  assert.equal(res.heldout.valid, false);
  assert.equal(res.releaseEvidence, 'insufficient');
  const reasons = res.heldout.invalidReasons.join(' | ');
  assert.match(reasons, /only 1 labelled held-out clips/);
  assert.match(reasons, /synthetic labels/);
  assert.match(reasons, /blinded/);
  assert.match(reasons, /two distinct reviewers/);
  assert.match(reasons, /also in the development split/);
});

test('thirty real, blinded, two-reviewer, disjoint held-out clips make the split valid (thresholds stay proposed)', () => {
  const clips = Array.from({ length: 30 }, (_, i) => clip('heldout', `h${i}`,
    labels({ clipId: `h${i}`, split: 'heldout', synthetic: false, sourceSha256: String(i).padStart(64, 'b') }), report()));
  const res = scoreCorpus(clips, { eventMetrics: { eventPrecision: { min: 0.85 } } });
  assert.equal(res.heldout.valid, true);
  assert.equal(res.releaseEvidence, 'heldout_present_thresholds_still_proposed');
  assert.equal(res.heldout.usableShare, 1);
  assert.deepEqual(res.heldout.usableShareCi95?.map((x) => Math.round(x * 100)), [89, 100], 'thirty clips still leave a wide interval');
});

test('copies of one source recording and blank reviewer ids cannot establish held-out evidence', () => {
  const clips = Array.from({ length: 30 }, (_, i) => clip('heldout', `h${i}`,
    labels({ clipId: `h${i}`, split: 'heldout', synthetic: false, reviewers: ['r1', ' '] }), report()));
  const held = scoreCorpus(clips).heldout;
  assert.equal(held.valid, false);
  assert.match(held.invalidReasons.join('; '), /distinct source recordings/);
  assert.match(held.invalidReasons.join('; '), /two distinct reviewers/);
});

test('source hash casing cannot hide a source shared between development and held-out', () => {
  const dev = clip('development', 'dev', labels({ clipId: 'dev' }), report());
  const held = clip('heldout', 'held', labels({ clipId: 'held', split: 'heldout', synthetic: false, sourceSha256: 'A'.repeat(64) }), report());
  assert.match(scoreCorpus([dev, held]).heldout.invalidReasons.join('; '), /also in the development split/);
});

test('a run comparison rejects relabelled ground truth even when the clip ids are unchanged', () => {
  const before = scoreCorpus([clip('development', 'c1', labels(), report())]).development;
  const after = scoreCorpus([clip('development', 'c1', labels({ visibleIntervals: [[10, 31]] }), report())]).development;
  assert.match(compareRuns(before, after, ['c1'], ['c1']).reasons.join('; '), /different labels/);
});

test('raw reports with no publication scope are never assumed full', () => {
  const raw = { report: report() };
  assert.equal(adaptReport(raw).scope, undefined);
  assert.equal(scoreClip(labels(), adaptReport(raw)).usable, false);
  assert.equal(scoreClip(labels(), adaptReport(raw, { scope: 'full' })).usable, true);
});

test('empty held-out label files do not count as identity evidence', () => {
  const clips = Array.from({ length: 30 }, (_, i) => clip('heldout', `h${i}`,
    labels({ clipId: `h${i}`, split: 'heldout', synthetic: false, sourceSha256: String(i).padStart(64, 'b'),
      visibleIntervals: [], absentIntervals: [] }), report()));
  assert.equal(scoreCorpus(clips).heldout.valid, false);
  assert.match(scoreCorpus(clips).heldout.invalidReasons.join('; '), /reviewed presence or absence/);
});

test('p95 is reported only from 20 or more samples', () => {
  const make = (n: number) => scoreCorpus(Array.from({ length: n }, (_, i) =>
    clip('development', `c${i}`, labels({ clipId: `c${i}` }), report({ firstUsefulSec: 100 + i }))));
  assert.equal(make(19).development.firstUsefulSec.p95, null);
  assert.equal(make(19).development.firstUsefulSec.p50, 109);
  assert.equal(make(20).development.firstUsefulSec.p95, 118);
  assert.ok(wilson(0, 0) === null);
});

test('an optimisation that raises precision by reporting fewer events, or adds a wrong-player claim, is rejected', () => {
  const l = labels();
  const base = [clip('development', 'c1', l, report({ events: [{ type: 'contact', start: 12.5, end: 13 }, { type: 'contact', start: 25, end: 25.5 }, { type: 'contact', start: 90, end: 91 }] }))];
  const names = ['c1'];
  const sum = (cs: CorpusClip[]) => scoreCorpus(cs).development;
  const b = sum(base);
  assert.equal(compareRuns(b, sum(base), names, names).accepted, true, 'identical output passes');

  const fewer = [clip('development', 'c1', l, report({ events: [{ type: 'contact', start: 12.5, end: 13 }] }))];
  const f = compareRuns(b, sum(fewer), names, names);
  assert.ok(sum(fewer).eventPrecision! > b.eventPrecision!, 'precision went up');
  assert.equal(f.accepted, false);
  assert.match(f.reasons.join(), /event recall/);

  const wrong = [clip('development', 'c1', l, report({ moments: [moment('m1', 12, 20), moment('bad', 42, 50)] , events: [{ type: 'contact', start: 12.5, end: 13 }, { type: 'contact', start: 25, end: 25.5 }] }))];
  assert.match(compareRuns(b, sum(wrong), names, names).reasons.join(), /wrong-player claims 0 -> 1/);
  assert.match(compareRuns(b, sum(base), names, ['other']).reasons.join(), /not the same clips/);
});

test('fixture replay of the recorded IMG_4809 report is never presented as accuracy evidence', async () => {
  const { readFileSync } = await import('node:fs');
  const { adaptReport } = await import('./support/reportEval.ts');
  const read = (p: string) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
  const l = read('docs/video/evaluation/img4809-dev.labels.json') as ClipLabels;
  const seconds = l.visibleIntervals.reduce((a, [s, e]) => a + (e - s), 0);
  assert.ok(Math.abs(seconds - 50.4) < 0.05, 'the derived labels reproduce the documented 50.4 s of target-visible developer labels');
  assert.equal(l.reviewers.length, 1);
  const res = scoreCorpus([clip('development', 'img4809-dev', l, adaptReport(read('tests/fixtures/tracking50-img4809-auto.json')))]);
  assert.equal(res.development.claims, 15);
  assert.equal(res.development.wrongPlayerClaims, 0);
  assert.equal(res.development.unverifiedClaims, 15, 'every recorded claim lies outside the labelled windows');
  assert.equal(res.development.usableReports, 0, 'so the report cannot be called usable on this evidence');
  assert.equal(res.development.eventRecall, null, 'nobody labelled events');
  assert.equal(res.releaseEvidence, 'insufficient');
});

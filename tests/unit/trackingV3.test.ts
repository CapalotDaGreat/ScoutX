import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyAnswer, emptyFeedback, encodeStateStrip, parseTrackingReport, trackingInvariantViolations, undoLast, validPeriods,
  workerFeedback, type TrackingReport,
} from '../../functions/src/analysis/trackingV3.ts';

function raw(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'pitchproof.tracking.v3',
    engine: { version: '3.0.0' },
    target: { number: '20', kit: 'orange', kit2: 'white', position: 'winger' },
    timeline: { periods: [{ start: 0, end: 100, kind: 'play', label: 'play', source: 'detected' }] },
    coverage: { recordingSec: 100, nonMatchSec: 0, offPitchSec: 0, matchSec: 100, unobservedSec: 10, analysedSec: 90,
      confirmedVisibleSec: 10, likelyVisibleSec: 20, ambiguousSec: 30, notIdentifiedSec: 30 },
    identity: { statesSec: { CONFIRMED_VISIBLE: 10, LIKELY_VISIBLE: 20 }, numberSightings: 1, confirmedByUser: 2,
      // Non-target data from the worker that must not be persisted:
      iterations: [{ positives: 3 }] },
    physical: { status: 'experimental', productionVisible: false, reason: 'No calibration', provenance: 'estimate_experimental',
      values: { peakSpeed: { value: 24.1, unit: 'km/h', provenance: 'estimate_experimental', method: 'm' },
        sprintCount: { value: 1, unit: 'count', provenance: 'estimate_experimental', method: 'm' } },
      sprints: [{ start: 10, end: 14, durationSec: 4, peakKmh: 24.1, distanceM: 25 }], highSpeedRuns: [],
      thresholds: { sprint_kmh: 19.8, hsr_kmh: 14.4 } },
    ball: { contacts: 1, carries: 0, passAttempts: 1, completedPasses: 0, incompletePasses: 0, unknownOutcomePasses: 1 },
    events: [
      { type: 'contact', start: 5, end: 6, identityState: 'CONFIRMED_VISIBLE', evidenceTimes: [5], confidence: 0.8 },
      { type: 'contact', start: 7, end: 8, identityState: 'AMBIGUOUS', evidenceTimes: [7], confidence: 0.8 },
      { type: 'pass_attempt', start: 6, end: 9, identityState: 'CONFIRMED_VISIBLE', outcome: 'unknown',
        outcomeEvidence: 'ball track interrupted', evidenceTimes: [6], confidence: 0.5 },
    ],
    reviewQuestions: [{ t: 42.1, box: [100, 200, 140, 300], affectedSec: 30, currentlyTarget: true, score: 0.5 }],
    excluded: [{ tid: 9, why: 'shows #17' }],
    numberReads: { 9: [[1, '17', 0.99, 'shirt']] },
    tracklets: [{ tid: 3 }],
    ...overrides,
  };
}

test('a consistent worker report is accepted and persisted target-only', () => {
  const r = parseTrackingReport(raw());
  assert.ok(r);
  const json = JSON.stringify(r);
  assert.ok(!json.includes('shows #17') && !json.includes('numberReads') && !json.includes('excluded'));
  assert.equal(r.events.length, 2, 'events on non-claimed (ambiguous) frames are dropped');
  assert.equal(r.physical.productionVisible, false);
  assert.equal(r.heatmap.status, 'unavailable');
});

test('duel/tackle candidates are kept for review, flagged and never counted', () => {
  const r = parseTrackingReport(raw({ events: [
    { type: 'duel_candidate', start: 3, end: 4, identityState: 'CONFIRMED_VISIBLE', evidenceTimes: [3], confidence: 0.4 },
  ] }));
  assert.ok(r);
  assert.equal(r.events[0].candidate, true);
  assert.equal(r.ball.contacts, 1, 'candidates do not change the counted statistics');
  assert.equal(parseTrackingReport(raw({ events: [{ type: 'goal', start: 1, end: 2, identityState: 'CONFIRMED_VISIBLE',
    evidenceTimes: [], confidence: 1 }] })), null, 'unknown event types are rejected');
});

test('inconsistent reports are rejected, never shown', () => {
  const badCoverage = raw();
  (badCoverage.coverage as Record<string, number>).confirmedVisibleSec = 50;
  assert.equal(parseTrackingReport(badCoverage), null, 'states must partition analysed time');
  const badPeak = raw();
  (badPeak.physical as { sprints: Array<{ peakKmh: number }> }).sprints[0].peakKmh = 31.9;
  assert.equal(parseTrackingReport(badPeak), null, 'sprint peak above summary peak');
  const fakePass = raw({ events: [{ type: 'pass_attempt', start: 1, end: 2, identityState: 'CONFIRMED_VISIBLE',
    outcome: 'completed', outcomeEvidence: 'guess', evidenceTimes: [], confidence: 0.9 }] });
  assert.equal(parseTrackingReport(fakePass), null, 'completed pass needs verified evidence');
  const visible = raw();
  (visible.physical as Record<string, unknown>).productionVisible = true;
  assert.equal(parseTrackingReport(visible)?.physical.productionVisible, false, 'uncalibrated metrics never production-visible');
  assert.equal(parseTrackingReport({ ...raw(), schema: 'v2' }), null);
});

test('answers are idempotent, replace earlier answers to the same question and can be undone', () => {
  const report = parseTrackingReport(raw()) as TrackingReport;
  const qid = report.reviewQuestions[0].id;
  let fb = applyAnswer(emptyFeedback(), report, qid, 'yes', 'op_00000001', 'now');
  assert.ok(fb);
  assert.equal(applyAnswer(fb, report, qid, 'yes', 'op_00000001', 'now'), fb);
  fb = applyAnswer(fb, report, qid, 'not_me', 'op_00000002', 'now');
  assert.ok(fb);
  assert.equal(fb.entries.length, 1);
  assert.deepEqual(workerFeedback(fb).no, [[42.1, 120, 250]]);
  assert.equal(workerFeedback(fb).yes.length, 0);
  assert.equal(undoLast(fb).entries.length, 0);
  assert.equal(applyAnswer(emptyFeedback(), report, 'q_unknown', 'yes', 'op_00000003', 'now'), null);
  const unsure = applyAnswer(emptyFeedback(), report, qid, 'unsure', 'op_00000004', 'now');
  assert.ok(unsure);
  assert.deepEqual(workerFeedback(unsure), { yes: [], no: [], periods: {}, offPitch: [], asked: [[42.1, 120, 250]] },
    'unsure carries no evidence - it only stops the same player being asked again');
});

test('period corrections must be ordered, inside the video and paired for half-time', () => {
  assert.ok(validPeriods({ kickoff: 60, halftimeStart: 2800, secondHalfStart: 3700, fulltime: 6500 }, 7000));
  assert.ok(!validPeriods({ kickoff: 60, halftimeStart: 2800 }, 7000));
  assert.ok(!validPeriods({ kickoff: 3000, fulltime: 100 }, 7000));
  assert.ok(!validPeriods({ fulltime: 8000 }, 7000));
});

test('state strip is run-length encoded per second', () => {
  const times = [0, 0.5, 1, 1.5, 2, 2.5];
  const states = ['UNKNOWN', 'UNKNOWN', 'CONFIRMED_VISIBLE', 'CONFIRMED_VISIBLE', 'CONFIRMED_VISIBLE', 'BOGUS'];
  assert.deepEqual(encodeStateStrip(times, states), [[0, 1, 'UNKNOWN'], [1, 2, 'CONFIRMED_VISIBLE'], [2, 3, 'CONFIRMED_VISIBLE']]
    .reduce<Array<[number, number, string]>>((acc, cur) => {
      const last = acc[acc.length - 1];
      if (last && last[2] === cur[2] && last[1] === cur[0]) last[1] = cur[1] as number;
      else acc.push(cur as [number, number, string]);
      return acc;
    }, []));
});

test('invariant checker flags count and partition mismatches', () => {
  const r = parseTrackingReport(raw()) as TrackingReport;
  assert.deepEqual(trackingInvariantViolations(r), []);
  assert.ok(trackingInvariantViolations({ ...r, ball: { ...r.ball, passAttempts: 3 } }).includes('pass_partition'));
});

// ---------------------------------------------------------------------------- app presentation
import {
  coverageSegments, looksLikeVideoLink, nextQuestion, physicalPresentation, shareOfAnalysed,
  type TrackingReport as ClientReport,
} from '../../src/features/match-analysis/services/trackingPresentation.ts';

test('app presentation: honest denominators, fenced physical metrics, question order', () => {
  const report = parseTrackingReport(raw()) as unknown as ClientReport;
  assert.equal(shareOfAnalysed(report.coverage.confirmedVisibleSec, report.coverage), 11, '10 s of 90 s analysed');
  const segs = coverageSegments(report.coverage);
  assert.ok(Math.abs(segs.reduce((a, s) => a + s.fraction, 0) - 1) < 1e-9, 'segments partition the recording');
  assert.equal(physicalPresentation(report), 'experimental');
  assert.equal(physicalPresentation({ ...report, physical: { ...report.physical, status: 'calibrated', productionVisible: true } }), 'verified');
  assert.equal(nextQuestion(report, new Set())?.t, 42.1);
  assert.equal(nextQuestion(report, new Set([report.reviewQuestions[0].id])), null);
  assert.ok(looksLikeVideoLink('https://app.veo.co/matches/x'));
  assert.ok(!looksLikeVideoLink('app.veo.co/matches/x') && !looksLikeVideoLink('http://x.y/z'));
});

test('4.0 moments: validated, target-only and answerable as "Is this you?"', async () => {
  const { answerTarget, parseMoments } = await import('../../functions/src/analysis/trackingV3.ts');
  const moment = { id: 'm_50', kind: 'spell', kinds: ['spell'], start: 6, end: 11, clipStart: 5, clipEnd: 12,
    identityState: 'LIKELY_VISIBLE', candidate: false, indicator: [[6, 0.1, 0.2, 0.1, 0.2], [9, 0.5, 0.5, 0.1, 0.2]] };
  const r = parseTrackingReport(raw({ moments: [moment], videoSize: { width: 1000, height: 500 },
    analysedRange: { startSec: 0, endSec: 100, parts: 3 } }));
  assert.ok(r);
  assert.equal(r.moments.length, 1);
  assert.equal(r.analysedRange.parts, 3);
  const tgt = answerTarget(r, 'm_50');
  assert.deepEqual(tgt, { t: 9, point: [550, 300] });
  const fb = applyAnswer(emptyFeedback(), r, 'm_50', 'yes', 'op_12345678', '2026-10-27T00:00:00Z');
  assert.deepEqual(workerFeedback(fb!).yes, [[9, 550, 300]]);
  // Invalid moments invalidate the report: wrong identity, overlong clip, candidate flag mismatch, outside the recording.
  for (const bad of [{ identityState: 'AMBIGUOUS' }, { clipEnd: 40 }, { kind: 'duel_candidate', candidate: false },
    { clipStart: 95, clipEnd: 110, start: 96, end: 97 }, { indicator: [[50, 0.1, 0.1, 0.1, 0.1]] }]) {
    assert.equal(parseTrackingReport(raw({ moments: [{ ...moment, ...bad }] })), null, JSON.stringify(bad));
  }
  assert.deepEqual(parseMoments(undefined, 100), [], 'older workers without moments still parse');
  const noSize = parseTrackingReport(raw({ moments: [moment] }));
  assert.equal(answerTarget(noSize!, 'm_50'), null, 'without frame size a moment cannot be answered');
});

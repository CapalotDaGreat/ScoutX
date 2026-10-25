import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasConfirmedEventCoverage, parseCvSegmentResult, targetOnlyCvResult, type CvSegmentResult } from '../../functions/src/analysis/cvContract.ts';
import { markIdentityRejected } from '../../functions/src/analysis/identityCallable.ts';

const result: CvSegmentResult = {
  contractVersion: 2, workerVersion: 'test', models: {}, segmentIndex: 0,
  stages: { tracking: 'complete', identity: 'complete', events: 'complete', pitch: 'unavailable' },
  cameraView: 'wide', identity: { state: 'CONFIRMED_VISIBLE', candidates: [] },
  availability: [{ startSec: 0, endSec: 5, state: 'CONFIRMED_VISIBLE', confidence: 0.8 }],
  coverage: { analysedSec: 10, targetVisibleSec: 5, framesDecoded: 20 },
  events: [{ type: 'pass', startSec: 1, endSec: 2, frameTimesSec: [1], confidence: 0.9 }],
};
const expected = { segmentIndex: 0, startSec: 0, endSec: 10 };

test('CV persistence removes candidate identities without mutating the transient result', () => {
  const transient: CvSegmentResult = { ...result, identity: { state: 'CANDIDATE', candidates: [{
    trackId: 'opponent', jerseyRead: '18', jerseyConfidence: 0.9, teamMatch: 0.9, firstSec: 0, lastSec: 1,
  }] } };
  assert.deepEqual(targetOnlyCvResult(transient).identity.candidates, []);
  assert.equal(transient.identity.candidates[0].jerseyRead, '18');
});

test('CV results reject contradictory visibility and invalid decoded counts', () => {
  assert.ok(parseCvSegmentResult(result, expected));
  for (const framesDecoded of [-1, 0.5, NaN, Infinity, 0]) {
    assert.equal(parseCvSegmentResult({ ...result, coverage: { ...result.coverage, framesDecoded } }, expected), null);
  }
  assert.equal(parseCvSegmentResult({ ...result, identity: { state: 'CANDIDATE' } }, expected), null);
  assert.equal(parseCvSegmentResult({ ...result, stages: { ...result.stages, tracking: 'failed' } }, expected), null);
  assert.equal(parseCvSegmentResult({ ...result, coverage: { ...result.coverage, targetVisibleSec: 8 } }, expected), null);
});

test('event citations must belong to their own time interval', () => {
  const parsed = parseCvSegmentResult({ ...result, events: [{ ...result.events[0], frameTimesSec: [9] }] }, expected);
  assert.deepEqual(parsed?.events, []);
});

test('counted events require continuous confirmed target coverage, never unknown gaps', () => {
  assert.equal(hasConfirmedEventCoverage(result, result.events[0]), true);
  assert.equal(hasConfirmedEventCoverage(result, { ...result.events[0], endSec: 7 }), false);
  assert.equal(hasConfirmedEventCoverage({ ...result, identity: { state: 'UNKNOWN', candidates: [] } }, result.events[0]), false);
  const gapped: CvSegmentResult = { ...result, availability: [
    { startSec: 0, endSec: 1.5, state: 'CONFIRMED_VISIBLE', confidence: 0.8 },
    { startSec: 1.5, endSec: 1.7, state: 'UNKNOWN', confidence: 0 },
    { startSec: 1.7, endSec: 5, state: 'CONFIRMED_VISIBLE', confidence: 0.8 },
  ] };
  assert.equal(hasConfirmedEventCoverage(gapped, result.events[0]), false);
});

test('identity rejection removes already released target-dependent claims', () => {
  const rejected = markIdentityRejected({
    strengths: ['old'], improvements: ['old'], coachingNotes: 'old', evidence: [{ id: 'old' }],
    estimatedStats: { goals: 2 }, eventCounts: { pass: 2 }, clip: { decision: 'old' },
    techniqueAssessment: { ratedCount: 3 }, sections: [{ id: 'technique', availability: 'AVAILABLE' }],
  });
  for (const key of ['strengths', 'improvements', 'evidence', 'events', 'decisionMoments', 'possibleEvents']) assert.deepEqual(rejected[key], []);
  assert.equal(rejected.eventCounts, null);
  assert.equal(rejected.clip, null);
  assert.equal(rejected.coachingNotes, '');
  assert.ok(Object.values(rejected.estimatedStats as Record<string, unknown>).every((value) => value === null));
  assert.equal((rejected.techniqueAssessment as { ratedCount: number }).ratedCount, 0);
});

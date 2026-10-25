import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POSITION_FOCUS, resolveEvaluationPosition, positionEvaluationInstructions } from '../../functions/src/analysis/positionFramework.ts';
import { buildSynthesisPrompt, normalizeSegmentReview, normalizeSynthesis } from '../../functions/src/analysis/segmentReview.ts';
import { recordingTimestamp, reportEvidence } from '../../src/features/match-analysis/components/intelligence/reportEvidence.ts';
import type { MatchAnalysisJob } from '../../src/features/match-analysis/types.ts';
import { TARGET_POSITIONS as CLIENT_POSITIONS } from '../../src/features/match-analysis/types.ts';
import { TARGET_POSITIONS as SERVER_POSITIONS, targetingMetadata, isGoalkeeperJob } from '../../functions/src/analysis/frameAnalysis.ts';

test('specific role selection reaches server coaching without losing legacy roles', () => {
  assert.deepEqual(CLIENT_POSITIONS, SERVER_POSITIONS);
  for (const position of Object.keys(POSITION_FOCUS)) {
    assert.ok((CLIENT_POSITIONS as readonly string[]).includes(position));
    assert.equal(targetingMetadata({ targeting: { jerseyNumber: '17', kitPrimaryColor: 'green', kitSecondaryColor: '', position } }).position, position);
  }
  assert.equal(isGoalkeeperJob({ targeting: { jerseyNumber: '1', kitPrimaryColor: '', kitSecondaryColor: '', position: 'GK' } }), true);
});

test('all 15 specific positions have distinct lenses; broad roles stay unknown', () => {
  assert.equal(Object.keys(POSITION_FOCUS).length, 15);
  for (const position of Object.keys(POSITION_FOCUS)) {
    assert.equal(resolveEvaluationPosition(position.toLowerCase()), position);
    assert.ok(positionEvaluationInstructions({ position }).join(' ').includes('Role changes are unknown'));
  }
  for (const position of ['defender', 'midfielder', 'forward', 'unknown', '', undefined]) {
    assert.equal(resolveEvaluationPosition(position), null);
  }
  assert.equal(resolveEvaluationPosition('goalkeeper'), 'GK');
});

test('prompts require evidence, unknown role changes and no invented ratings', () => {
  const prompt = buildSynthesisPrompt({ observations: [], durationSec: 90, sampledFrames: 2, targetSeenFrames: 0, targeting: { position: 'ST' } });
  assert.match(prompt.user, /Role changes are unknown/);
  assert.match(prompt.user, /observationIds/);
  assert.match(prompt.user, /Do not generate position scores/);
});

test('normalization excludes replay, unknown camera, unknown refs and invalid timestamps', () => {
  const review = normalizeSegmentReview({ segmentIndex: 0, modelId: 'test', now: 'test',
    frames: [{ id: 'a', timestampSec: 2 }, { id: 'b', timestampSec: 3 }, { id: 'c', timestampSec: NaN }],
    raw: { frames: [
      { frameId: 'a', targetVisible: 'yes', cameraView: 'replay' },
      { frameId: 'b', targetVisible: 'yes', cameraView: 'wide' },
      { frameId: 'c', targetVisible: 'yes', cameraView: 'wide' },
    ], observations: ['a', 'b', 'c', 'unknown'].map((frameId) => ({ frameId, detail: 'Visible stance', confidence: 'high' })),
    possibleEvents: [{ frameIds: ['a'] }, { frameIds: ['b'], status: 'validated' }] } });
  assert.equal(review.observations.length, 1);
  assert.equal(review.observations[0].timestampSec, 3);
  assert.equal(review.observations[0].confidence, 'low');
  assert.equal(review.possibleEvents[0].status, 'needs_review');
  const synthesis = normalizeSynthesis({ strengths: [{ text: 'Invented', observationIds: ['missing'] }] }, review.observations);
  assert.deepEqual(synthesis.strengths, []);
});

test('timeline derives recording time from complete frame citations only', () => {
  const job = { durationSec: 120, frames: [{ id: 'a', timestampSec: 61.9 }], report: { evidence: [
    { frameIds: ['a'], timestampSec: 0 }, { frameIds: ['missing'], timestampSec: 10 }, { frameIds: ['a', 'missing'] },
  ] } } as MatchAnalysisJob;
  assert.deepEqual(reportEvidence(job).map((item) => item.timestampSec), [61.9, null, null]);
  assert.equal(recordingTimestamp(61.9), '1:01');
});

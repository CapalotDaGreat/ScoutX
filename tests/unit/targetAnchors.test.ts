import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editTargetAnchors, MAX_TARGET_ANCHORS, parseTargetAnchorRequest, parseTargetBox, type TargetAnchorRequest } from '../../functions/src/analysis/targetAnchors.ts';
import { targetAnchorsEnabled } from '../../functions/src/analysis/targetAnchorCallable.ts';
import { productionBuildProblems } from '../../src/config/releaseBuildPolicy.ts';
import { invalidatedTargetData } from '../../functions/src/analysis/identityCallable.ts';

const request: TargetAnchorRequest = {
  jobId: 'anchor-job', frameId: 'frame_1', operationId: 'operation-12345678', operation: 'upsert',
  expectedGeneration: 0, expectedRevision: 0, box: { x: 0.2, y: 0.1, width: 0.2, height: 0.7 },
};

test('target box parser accepts only finite bounded geometry and exact keys', () => {
  assert.deepEqual(parseTargetBox(request.box), request.box);
  for (const box of [null, [], {}, { ...request.box, width: 0 }, { ...request.box, x: -0.1 },
    { ...request.box, width: 1 }, { ...request.box, y: NaN }, { ...request.box, height: Infinity },
    { ...request.box, extra: 1 }, { ...request.box, x: '0.2' }]) assert.equal(parseTargetBox(box), null);
});

test('anchor edits reject forged metadata, malformed IDs and unsafe revisions', () => {
  assert.deepEqual(parseTargetAnchorRequest(request), request);
  for (const patch of [{ timestampSec: 242 }, { sourcePath: 'forged' }, { expectedGeneration: -1 },
    { expectedRevision: 0.5 }, { expectedRevision: Number.MAX_SAFE_INTEGER + 1 }, { expectedGeneration: NaN },
    { frameId: '../frame_1' }, { jobId: '../job' }, { operationId: 'short' }, { operation: 'confirm' }, { box: null }]) {
    assert.equal(parseTargetAnchorRequest({ ...request, ...patch }), null);
  }
  const { box: _box, ...remove } = request;
  assert.ok(parseTargetAnchorRequest({ ...remove, operation: 'remove' }));
  assert.equal(parseTargetAnchorRequest({ ...request, operation: 'remove' }), null);
});

test('anchor updates are bounded, replace by frame and use only server-provided timestamps', () => {
  let anchors = editTargetAnchors([], request, 242);
  assert.equal(anchors[0].timestampSec, 242);
  anchors = editTargetAnchors(anchors, { ...request, box: { x: 0, y: 0, width: 1, height: 1 } }, 242);
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].provenance, 'user_selected');
  for (let index = 2; index <= MAX_TARGET_ANCHORS; index++) {
    anchors = editTargetAnchors(anchors, { ...request, frameId: `frame_${index}` }, index);
  }
  assert.throws(() => editTargetAnchors(anchors, { ...request, frameId: 'frame_99' }, 900));
  const { box: _box, ...remove } = request;
  assert.equal(editTargetAnchors(anchors, { ...remove, operation: 'remove' }, 242).length, MAX_TARGET_ANCHORS - 1);
  assert.throws(() => editTargetAnchors([], request, Infinity));
});

test('target selection is disabled unless explicitly enabled', () => {
  for (const value of [undefined, '', 'false', 'TRUE', '1']) assert.equal(targetAnchorsEnabled({ EXPERIMENTAL_TARGET_ANCHORS: value }), false);
  assert.equal(targetAnchorsEnabled({ EXPERIMENTAL_TARGET_ANCHORS: 'true' }), true);
});

test('production builds reject the experimental target selection flag', () => {
  assert.ok(productionBuildProblems({ EXPO_PUBLIC_EXPERIMENTAL_TARGET_ANCHORS: 'true' }).some((problem) =>
    problem.field === 'EXPO_PUBLIC_EXPERIMENTAL_TARGET_ANCHORS' && problem.kind === 'unsafe'));
});

test('all identity changes share root and report invalidation', () => {
  const next = invalidatedTargetData({ events: [{ id: 'old' }], coachingNotes: 'old', confidenceDimensions: { playerIdentity: 'Excellent' } });
  assert.deepEqual(next.events, []);
  assert.deepEqual(next.availability, []);
  assert.equal((next.confidenceDimensions as Record<string, unknown>).playerIdentity, 'Insufficient');
  const report = next.report as Record<string, unknown>;
  assert.deepEqual(report.events, []);
  assert.equal((report.coverage as Record<string, unknown>).confidenceLabel, 'Insufficient');
  assert.equal(report.coachingNotes, '');
});
